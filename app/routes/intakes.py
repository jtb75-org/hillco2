"""Intake meetings — the family-level conversation that precedes one or
more engagements. See migrations 0006 (base), 0008 (member links), and
0009 (Discovery model) for the schema. Each intake captures a free
discovery meeting; structured outputs (family context, per-student
discovery, fit/outcome) live here, and the convert flow spawns one
engagement per candidate student."""
import json
from datetime import UTC, date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn
from .engagement_tasks import seed_catalog_for_engagement

router = APIRouter(prefix="/api", tags=["intakes"])


StatusFilter = Literal["active", "completed", "all"]

# Enums — mirrored from migration 0009's CHECK constraints. Pydantic
# rejects any value not in these literals before the row hits Postgres.
ReferralSource = Literal[
    "word_of_mouth", "pediatrician", "therapist",
    "school", "search", "returning", "other",
]
Outcome = Literal[
    "converting", "nurture",
    "declined_by_family", "declined_by_hillco",
    "no_response", "duplicate",
]
NextStepOwner = Literal["consultant", "family", "awaiting_records"]
MentionKind = Literal["school", "professional", "program", "other"]
LifecycleStage = Literal["lead", "prospect", "client", "archived"]

# Discovery + outcome outcomes that imply the family is no longer an
# active prospect. Used by the lifecycle auto-flip rules below.
DECLINED_OUTCOMES: frozenset[str] = frozenset(
    {"declined_by_family", "declined_by_hillco", "no_response"}
)


class Mention(BaseModel):
    """Lightweight "mentioned during discovery" chip. Promotion to a
    real entity (catalog school, contact, etc.) is a later concern."""
    text: Annotated[str, Field(min_length=1)]
    kind: MentionKind


# ---- request models -------------------------------------------------------


class IntakeCreate(BaseModel):
    family_id: UUID
    intake_date: date | None = None
    consultant_id: UUID | None = None
    notes: str | None = None


class IntakeUpdate(BaseModel):
    # Header
    intake_date: date | None = None
    consultant_id: UUID | None = None
    referral_source: ReferralSource | None = None
    # Family context
    desired_outcome: str | None = None
    constraints: list[str] | None = None
    consent_granted: bool | None = None
    family_context_notes: str | None = None
    # Bottom notes bucket (legacy column)
    notes: str | None = None
    # Outcome + next-step
    outcome: Outcome | None = None
    disposition_reason: str | None = None
    next_step_owner: NextStepOwner | None = None
    next_step_due: date | None = None
    blocker: str | None = None


class IntakeStudentUpdate(BaseModel):
    """Per-intake-student discovery + candidacy. None means leave
    unchanged; the empty string clears a text field."""
    working: str | None = None
    not_working: str | None = None
    history: str | None = None
    school_fit: str | None = None
    supports_tried: str | None = None
    candidate: bool | None = None
    recommended_engagement_type: str | None = None
    mentions: list[Mention] | None = None


# ---- helpers --------------------------------------------------------------


async def _intake_or_404(conn, intake_id: UUID):
    row = await conn.fetchrow(
        "SELECT * FROM intakes WHERE id = $1 AND deleted_at IS NULL",
        intake_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Intake not found")
    return row


async def _validate_engagement_type(conn, code: str) -> None:
    """Local copy of the helper used by app/routes/engagements.py.
    Imported inline so this module doesn't take a route-to-route
    dependency."""
    exists = await conn.fetchval(
        "SELECT 1 FROM engagement_types WHERE code = $1 AND deleted_at IS NULL",
        code,
    )
    if not exists:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown engagement_type '{code}'.",
        )


def _maybe_json(value):
    """JSONB columns come back from asyncpg as Python strings when no
    codec is registered. Decode for the response shape; leave non-str
    values (defaults, already-parsed) alone."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _intake_row_to_response(row: dict) -> dict:
    """Hydrate the JSONB columns + drop nothing. Returns a fresh dict
    so the caller can layer on guardians/students arrays."""
    out = dict(row)
    if "constraints" in out:
        out["constraints"] = _maybe_json(out["constraints"]) or []
    return out


# ---- intake list/create ---------------------------------------------------


@router.get("/intakes")
async def list_intakes(
    status: StatusFilter = Query(
        "active",
        description="active = completed_at IS NULL; completed; all",
    ),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """All intakes across the practice, newest first. Includes the
    family household name and consultant display name so the SPA's
    list view can render each row without per-row roundtrips. Now also
    exposes outcome + next_step_due for the upcoming tail PR that
    surfaces them in the list."""
    if status == "active":
        clause = "AND i.completed_at IS NULL"
    elif status == "completed":
        clause = "AND i.completed_at IS NOT NULL"
    else:
        clause = ""

    rows = await conn.fetch(
        f"""
        SELECT i.id, i.family_id, i.intake_date, i.consultant_id, i.notes,
               i.completed_at, i.outcome, i.outcome_at, i.converted_at,
               i.next_step_owner, i.next_step_due, i.created_at, i.updated_at,
               f.household_name,
               TRIM(BOTH ' ' FROM
                 COALESCE(p.first_name, '') ||
                 CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                      THEN ' ' || p.last_name ELSE '' END
               ) AS consultant_name
        FROM intakes i
        JOIN families f ON f.id = i.family_id AND f.deleted_at IS NULL
        LEFT JOIN people p ON p.id = i.consultant_id
        WHERE i.deleted_at IS NULL {clause}
        ORDER BY i.intake_date DESC, i.created_at DESC
        """
    )
    return [dict(r) for r in rows]


@router.post("/intakes", status_code=201)
async def create_intake(
    body: IntakeCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    if not await conn.fetchval(
        "SELECT 1 FROM families WHERE id = $1 AND deleted_at IS NULL",
        body.family_id,
    ):
        raise HTTPException(status_code=404, detail="Family not found")

    consultant_id = body.consultant_id or user["id"]
    notes = (body.notes or "").strip() or None

    row = await conn.fetchrow(
        """
        INSERT INTO intakes (family_id, intake_date, consultant_id, notes)
        VALUES (
          $1,
          COALESCE($2, CURRENT_DATE),
          $3,
          $4
        )
        RETURNING *
        """,
        body.family_id, body.intake_date, consultant_id, notes,
    )
    return _intake_row_to_response(row)


# ---- intake detail --------------------------------------------------------


@router.get("/intakes/{intake_id}")
async def get_intake(
    intake_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    intake = await _intake_or_404(conn, intake_id)
    out = _intake_row_to_response(intake)
    out["guardians"] = await _intake_guardians(conn, intake_id)
    out["students"] = await _intake_students(conn, intake_id)
    return out


async def _intake_guardians(conn, intake_id: UUID) -> list[dict]:
    """Per-intake guardian roster — joined to people + family_guardians
    so the SPA gets the display fields and role/contact flags in one
    fetch. Ordered by name."""
    rows = await conn.fetch(
        """
        SELECT
          p.id,
          TRIM(BOTH ' ' FROM
            COALESCE(p.first_name, '') ||
            CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                 THEN ' ' || p.last_name ELSE '' END
          )                                       AS name,
          p.email, p.phone,
          fg.relationship                         AS role,
          fg.is_primary_contact, fg.is_billing_contact,
          NULLIF(
            TRIM(BOTH E'\n' FROM
              CONCAT_WS(E'\n',
                NULLIF(p.street1, ''),
                NULLIF(p.street2, ''),
                CASE WHEN COALESCE(p.city, '') <> ''
                       OR COALESCE(p.state, '') <> ''
                       OR COALESCE(p.postal_code, '') <> ''
                     THEN CONCAT_WS(' ',
                            NULLIF(p.city, ''),
                            NULLIF(p.state, ''),
                            NULLIF(p.postal_code, '')
                          )
                     ELSE NULL END
              )
            ),
            ''
          )                                       AS mailing_address,
          NULLIF(
            TRIM(BOTH E'\n' FROM
              CONCAT_WS(E'\n',
                NULLIF(p.billing_attention_to, ''),
                NULLIF(p.billing_street1, ''),
                NULLIF(p.billing_street2, ''),
                CASE WHEN COALESCE(p.billing_city, '') <> ''
                       OR COALESCE(p.billing_state, '') <> ''
                       OR COALESCE(p.billing_postal_code, '') <> ''
                     THEN CONCAT_WS(' ',
                            NULLIF(p.billing_city, ''),
                            NULLIF(p.billing_state, ''),
                            NULLIF(p.billing_postal_code, '')
                          )
                     ELSE NULL END
              )
            ),
            ''
          )                                       AS billing_address
        FROM intake_guardians ig
        JOIN people p ON p.id = ig.person_id AND p.deleted_at IS NULL
        JOIN intakes i ON i.id = ig.intake_id
        LEFT JOIN family_guardians fg
               ON fg.family_id = i.family_id AND fg.person_id = p.id
        WHERE ig.intake_id = $1
        ORDER BY p.last_name NULLS LAST, p.first_name
        """,
        intake_id,
    )
    return [dict(r) for r in rows]


async def _intake_students(conn, intake_id: UUID) -> list[dict]:
    """Per-intake student roster + discovery + candidacy. Bakes-in
    `existing_engagements` per row (status IN ('in_progress','on_hold')
    only — cancelled and completed are excluded, matching the plan)."""
    rows = await conn.fetch(
        """
        SELECT
          p.id,
          TRIM(BOTH ' ' FROM
            COALESCE(p.first_name, '') ||
            CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                 THEN ' ' || p.last_name ELSE '' END
          )                                       AS name,
          p.birthday                              AS dob,
          sd.current_grade, sd.current_school_id,
          sd.has_504, sd.has_iep, sd.has_learning_disability,
          sd.has_adhd, sd.has_intellectual_disability,
          sd.has_health_impairment, sd.has_emotional_disturbance,
          sd.autism_level,
          ist.working, ist.not_working, ist.history,
          ist.school_fit, ist.supports_tried,
          ist.candidate, ist.recommended_engagement_type,
          ist.mentions
        FROM intake_students ist
        JOIN people p ON p.id = ist.person_id AND p.deleted_at IS NULL
        LEFT JOIN student_details sd ON sd.person_id = p.id
        WHERE ist.intake_id = $1
        ORDER BY p.last_name NULLS LAST, p.first_name
        """,
        intake_id,
    )
    students = []
    for r in rows:
        student = dict(r)
        student["mentions"] = _maybe_json(student.get("mentions")) or []
        student["existing_engagements"] = await _existing_engagements(
            conn, student["id"]
        )
        student["intake_engagement"] = await _intake_engagement(
            conn, intake_id, student["id"]
        )
        students.append(student)
    return students


async def _intake_engagement(conn, intake_id: UUID, person_id: UUID) -> dict | None:
    """The live engagement this intake spawned for this student, if any.

    Drives the per-student "Create engagement" affordance: while this
    exists, the button is replaced by a link; deleting the engagement
    (which clears it, deleted_at IS NULL no longer matching) re-enables
    creation. Any status counts — a completed engagement still originated
    here — so the UI reflects reality rather than a stored flag."""
    row = await conn.fetchrow(
        """
        SELECT id, engagement_type, status
        FROM engagements
        WHERE intake_id = $1 AND student_id = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        """,
        intake_id,
        person_id,
    )
    return dict(row) if row else None


async def _existing_engagements(conn, person_id: UUID) -> list[dict]:
    """Active engagements for a student — feeds the "already engaged"
    affordance on the candidacy row. Plan calls for in_progress +
    on_hold only (not cancelled, not completed)."""
    rows = await conn.fetch(
        """
        SELECT id, engagement_type, status, start_date
        FROM engagements
        WHERE student_id = $1
          AND status IN ('in_progress', 'on_hold')
          AND deleted_at IS NULL
        ORDER BY start_date DESC NULLS LAST, created_at DESC
        """,
        person_id,
    )
    return [dict(r) for r in rows]


# ---- intake member links --------------------------------------------------


class MemberLink(BaseModel):
    person_id: UUID


async def _ensure_member_eligible(
    conn,
    intake_id: UUID,
    person_id: UUID,
    *,
    required_kind: str,
):
    """The intake-member endpoints can only link people who are already
    on the intake's family AND of the right kind (guardian / student).
    Anything else is a 400."""
    family_id = await conn.fetchval(
        "SELECT family_id FROM intakes WHERE id = $1 AND deleted_at IS NULL",
        intake_id,
    )
    if family_id is None:
        raise HTTPException(status_code=404, detail="Intake not found")

    junction = (
        "family_guardians" if required_kind == "guardian" else "family_students"
    )
    on_family = await conn.fetchval(
        f"""
        SELECT 1
        FROM {junction} j
        JOIN people p ON p.id = j.person_id AND p.deleted_at IS NULL
        WHERE j.family_id = $1 AND j.person_id = $2
          AND ($3::text = 'guardian' OR p.kind = 'student')
        """,
        family_id, person_id, required_kind,
    )
    if not on_family:
        raise HTTPException(
            status_code=400,
            detail=f"Person is not a {required_kind} on this intake's family.",
        )


@router.post("/intakes/{intake_id}/guardians", status_code=201)
async def link_intake_guardian(
    intake_id: UUID,
    body: MemberLink,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _ensure_member_eligible(conn, intake_id, body.person_id, required_kind="guardian")
    await conn.execute(
        """
        INSERT INTO intake_guardians (intake_id, person_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        """,
        intake_id, body.person_id,
    )
    return {"intake_id": str(intake_id), "person_id": str(body.person_id)}


@router.delete("/intakes/{intake_id}/guardians/{person_id}", status_code=204)
async def unlink_intake_guardian(
    intake_id: UUID,
    person_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _intake_or_404(conn, intake_id)
    await conn.execute(
        "DELETE FROM intake_guardians WHERE intake_id = $1 AND person_id = $2",
        intake_id, person_id,
    )
    return None


@router.post("/intakes/{intake_id}/students", status_code=201)
async def link_intake_student(
    intake_id: UUID,
    body: MemberLink,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _ensure_member_eligible(conn, intake_id, body.person_id, required_kind="student")
    await conn.execute(
        """
        INSERT INTO intake_students (intake_id, person_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        """,
        intake_id, body.person_id,
    )
    return {"intake_id": str(intake_id), "person_id": str(body.person_id)}


@router.delete("/intakes/{intake_id}/students/{person_id}", status_code=204)
async def unlink_intake_student(
    intake_id: UUID,
    person_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _intake_or_404(conn, intake_id)
    await conn.execute(
        "DELETE FROM intake_students WHERE intake_id = $1 AND person_id = $2",
        intake_id, person_id,
    )
    return None


@router.patch("/intakes/{intake_id}/students/{person_id}")
async def update_intake_student(
    intake_id: UUID,
    person_id: UUID,
    body: IntakeStudentUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Per-intake-student discovery + candidacy. Validates the student
    is linked to the intake, validates recommended_engagement_type
    against the engagement_types catalog when provided."""
    linked = await conn.fetchval(
        """
        SELECT 1 FROM intake_students ist
        JOIN intakes i ON i.id = ist.intake_id AND i.deleted_at IS NULL
        WHERE ist.intake_id = $1 AND ist.person_id = $2
        """,
        intake_id, person_id,
    )
    if not linked:
        raise HTTPException(
            status_code=404,
            detail="Student is not linked to this intake.",
        )

    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    if fields.get("recommended_engagement_type"):
        await _validate_engagement_type(conn, fields["recommended_engagement_type"])

    # JSONB columns need explicit json.dumps because no codec is
    # registered. The SET clause below casts them to ::jsonb so the
    # column comes through cleanly.
    if "mentions" in fields:
        fields["mentions"] = json.dumps(
            [m.model_dump(mode="json") for m in body.mentions or []]
        )

    set_sql = ", ".join(
        f"{col} = ${i + 3}::jsonb" if col == "mentions" else f"{col} = ${i + 3}"
        for i, col in enumerate(fields)
    )
    row = await conn.fetchrow(
        f"""
        UPDATE intake_students
        SET {set_sql}
        WHERE intake_id = $1 AND person_id = $2
        RETURNING *
        """,
        intake_id, person_id,
        *fields.values(),
    )
    out = dict(row)
    out["mentions"] = _maybe_json(out.get("mentions")) or []
    return out


# ---- family-scoped list ---------------------------------------------------


@router.get("/families/{family_id}/intakes")
async def list_family_intakes(
    family_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    rows = await conn.fetch(
        """
        SELECT i.*,
               TRIM(BOTH ' ' FROM
                 COALESCE(p.first_name, '') ||
                 CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                      THEN ' ' || p.last_name ELSE '' END
               ) AS consultant_name
        FROM intakes i
        LEFT JOIN people p ON p.id = i.consultant_id
        WHERE i.family_id = $1 AND i.deleted_at IS NULL
        ORDER BY i.intake_date DESC, i.created_at DESC
        """,
        family_id,
    )
    return [_intake_row_to_response(r) for r in rows]


# ---- patch + transition + lifecycle ---------------------------------------


async def _flip_family_lifecycle(
    conn,
    family_id: UUID,
    *,
    prev_outcome: str | None,
    next_outcome: str | None,
):
    """One-way auto-flips on outcome transitions:
    - decline-shaped outcome + zero active engagements → archived.
    - nurture outcome + lead → prospect.
    - (convert flips to client; handled in convert flow.)
    Outcome reversal does **not** auto-revert the stage."""
    if next_outcome == prev_outcome:
        return

    stage = await conn.fetchval(
        "SELECT lifecycle_stage FROM families WHERE id = $1 AND deleted_at IS NULL",
        family_id,
    )
    if stage is None:
        return

    if next_outcome in DECLINED_OUTCOMES:
        # Only archive if there are no active engagements anywhere on
        # the family. A family that already has a paid engagement
        # stays a client even if a follow-up intake declines.
        has_active = await conn.fetchval(
            """
            SELECT 1 FROM engagements
            WHERE family_id = $1
              AND status IN ('in_progress', 'on_hold')
              AND deleted_at IS NULL
            LIMIT 1
            """,
            family_id,
        )
        if not has_active:
            await conn.execute(
                "UPDATE families SET lifecycle_stage = 'archived' WHERE id = $1",
                family_id,
            )
    elif next_outcome == "nurture" and stage == "lead":
        await conn.execute(
            "UPDATE families SET lifecycle_stage = 'prospect' WHERE id = $1",
            family_id,
        )


@router.patch("/intakes/{intake_id}")
async def update_intake(
    intake_id: UUID,
    body: IntakeUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Update intake fields. The API owns the outcome transition: when
    `outcome` flips from null → non-null, we stamp `outcome_at` and
    `completed_at` in the same statement; null → non-null also fires
    the family lifecycle auto-flip rules. Reverse (non-null → null)
    clears both timestamps but doesn't auto-revert the family stage."""
    fields = body.model_dump(exclude_unset=True)
    if "notes" in fields:
        fields["notes"] = (fields["notes"] or "").strip() or None
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Pre-convert JSONB-shaped fields.
    if "constraints" in fields:
        fields["constraints"] = json.dumps(fields["constraints"] or [])

    # Outcome transitions also touch outcome_at + completed_at. We
    # always pass these three columns together when outcome is in the
    # patch — Postgres + the API agree on a single state machine.
    will_transition = "outcome" in fields
    if will_transition:
        if fields["outcome"] is None:
            fields["outcome_at"] = None
            fields["completed_at"] = None
        else:
            now = datetime.now(UTC)
            fields["outcome_at"] = now
            fields["completed_at"] = now

    # Build the SET clause. JSONB columns get cast explicitly.
    jsonb_cols = {"constraints"}
    set_fragments = []
    args: list = [intake_id]
    for col, val in fields.items():
        args.append(val)
        cast = "::jsonb" if col in jsonb_cols else ""
        set_fragments.append(f"{col} = ${len(args)}{cast}")
    set_sql = ", ".join(set_fragments)

    async with conn.transaction():
        prev = await _intake_or_404(conn, intake_id)
        row = await conn.fetchrow(
            f"UPDATE intakes SET {set_sql} WHERE id = $1 RETURNING *",
            *args,
        )

        if will_transition:
            await _flip_family_lifecycle(
                conn,
                prev["family_id"],
                prev_outcome=prev["outcome"],
                next_outcome=fields["outcome"],
            )

    return _intake_row_to_response(row)


# ---- legacy complete/reopen (kept until PR-Frontend swaps the SPA) --------


@router.post("/intakes/{intake_id}/complete")
async def complete_intake(
    intake_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Legacy endpoint — the new flow drives closure via PATCH outcome.
    Kept until the SPA swap (PR-Frontend) so the live form keeps
    working. Stamps `completed_at = NOW()` only; does not set outcome."""
    await _intake_or_404(conn, intake_id)
    row = await conn.fetchrow(
        """
        UPDATE intakes
        SET completed_at = COALESCE(completed_at, NOW())
        WHERE id = $1
        RETURNING *
        """,
        intake_id,
    )
    return _intake_row_to_response(row)


@router.post("/intakes/{intake_id}/reopen")
async def reopen_intake(
    intake_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Legacy endpoint — clears `completed_at`. Does not touch outcome."""
    await _intake_or_404(conn, intake_id)
    row = await conn.fetchrow(
        "UPDATE intakes SET completed_at = NULL WHERE id = $1 RETURNING *",
        intake_id,
    )
    return _intake_row_to_response(row)


# ---- convert flow ---------------------------------------------------------


def _build_intake_snapshot(intake: dict, student: dict) -> str:
    """Serialize the intake's discovery context for one student at
    convert time. Stored on engagements.intake_snapshot so engagements
    keep a stable record of what was discussed even if the intake is
    edited afterward."""
    return json.dumps(
        {
            "snapshotted_at": datetime.now(UTC).isoformat(),
            "intake_id": str(intake["id"]),
            "family": {
                "desired_outcome": intake.get("desired_outcome"),
                "constraints": _maybe_json(intake.get("constraints")) or [],
            },
            "student": {
                "working": student.get("working"),
                "not_working": student.get("not_working"),
                "history": student.get("history"),
                "school_fit": student.get("school_fit"),
                "supports_tried": student.get("supports_tried"),
                "mentions": _maybe_json(student.get("mentions")) or [],
            },
        }
    )


@router.post("/intakes/{intake_id}/convert")
async def convert_intake(
    intake_id: UUID,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Convert this intake into one engagement per candidate student.

    Validates: outcome=converting, not already converted, ≥1 candidate,
    each candidate has a valid recommended_engagement_type, and no
    duplicate active engagement of the same type already exists for
    that (intake, student). Wraps the whole thing in a row lock on the
    intake so concurrent calls can't double-fire."""
    engagement_ids: list[str] = []
    async with conn.transaction():
        # SELECT ... FOR UPDATE serializes the convert flow per intake.
        intake = await conn.fetchrow(
            "SELECT * FROM intakes WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
            intake_id,
        )
        if not intake:
            raise HTTPException(status_code=404, detail="Intake not found")
        if intake["converted_at"] is not None:
            raise HTTPException(
                status_code=409,
                detail="Intake has already been converted.",
            )
        if intake["outcome"] != "converting":
            raise HTTPException(
                status_code=400,
                detail="Intake outcome must be 'converting' to convert.",
            )

        candidates = await conn.fetch(
            """
            SELECT ist.*, p.kind
            FROM intake_students ist
            JOIN people p ON p.id = ist.person_id AND p.deleted_at IS NULL
            WHERE ist.intake_id = $1 AND ist.candidate = TRUE
            """,
            intake_id,
        )
        if not candidates:
            raise HTTPException(
                status_code=400,
                detail="At least one student must be a candidate.",
            )

        for c in candidates:
            if not c["recommended_engagement_type"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Every candidate student needs a "
                        "recommended_engagement_type."
                    ),
                )
            await _validate_engagement_type(conn, c["recommended_engagement_type"])
            # Duplicate guard — block creating a second in_progress/on_hold
            # engagement of the same type for the same student.
            dup = await conn.fetchval(
                """
                SELECT 1 FROM engagements
                WHERE family_id = $1
                  AND student_id = $2
                  AND engagement_type = $3
                  AND status IN ('in_progress', 'on_hold')
                  AND deleted_at IS NULL
                LIMIT 1
                """,
                intake["family_id"], c["person_id"], c["recommended_engagement_type"],
            )
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"An active {c['recommended_engagement_type']} "
                        f"engagement already exists for this student."
                    ),
                )

        for c in candidates:
            snapshot = _build_intake_snapshot(dict(intake), dict(c))
            eng_id = await conn.fetchval(
                """
                INSERT INTO engagements (
                  family_id, student_id, intake_id,
                  engagement_type, status, start_date,
                  lead_consultant_id, intake_snapshot
                ) VALUES ($1, $2, $3, $4, 'in_progress', CURRENT_DATE, $5, $6::jsonb)
                RETURNING id
                """,
                intake["family_id"], c["person_id"], intake_id,
                c["recommended_engagement_type"], user["id"], snapshot,
            )
            engagement_ids.append(str(eng_id))
            # Auto-seed every applicable catalog item for this engagement
            # type. Operator can still skip items or add bespoke ones from
            # the engagement page; idempotency on (engagement, service_item)
            # lets a follow-up bulk-from-catalog call be a no-op for these.
            await seed_catalog_for_engagement(
                conn,
                engagement_id=eng_id,
                engagement_type=c["recommended_engagement_type"],
                user_id=user["id"],
            )

        await conn.execute(
            "UPDATE intakes SET converted_at = NOW() WHERE id = $1",
            intake_id,
        )
        await conn.execute(
            "UPDATE families SET lifecycle_stage = 'client' WHERE id = $1",
            intake["family_id"],
        )

    return {"engagement_ids": engagement_ids}


class StudentEngagementCreate(BaseModel):
    engagement_type: str


@router.post("/intakes/{intake_id}/students/{person_id}/engagement")
async def create_student_engagement(
    intake_id: UUID,
    person_id: UUID,
    body: StudentEngagementCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Create one engagement for a single student on this intake.

    The per-student replacement for the batch convert flow: the operator
    picks a type on the student's row and clicks Create. Reuses the same
    intake snapshot + catalog seeding, applies the same duplicate guard,
    persists the chosen type on the intake_students row, and marks the
    intake converted (converted_at) + the family a client. Deleting the
    engagement later re-opens the intake via the engagements delete path.
    Row-locks the intake so concurrent creates can't double-fire."""
    async with conn.transaction():
        intake = await conn.fetchrow(
            "SELECT * FROM intakes WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
            intake_id,
        )
        if not intake:
            raise HTTPException(status_code=404, detail="Intake not found")

        student = await conn.fetchrow(
            """
            SELECT ist.*, p.kind
            FROM intake_students ist
            JOIN people p ON p.id = ist.person_id AND p.deleted_at IS NULL
            WHERE ist.intake_id = $1 AND ist.person_id = $2
            """,
            intake_id,
            person_id,
        )
        if not student:
            raise HTTPException(
                status_code=404, detail="Student is not on this intake."
            )

        engagement_type = body.engagement_type
        await _validate_engagement_type(conn, engagement_type)

        # Duplicate guard — same rule as the batch convert.
        dup = await conn.fetchval(
            """
            SELECT 1 FROM engagements
            WHERE family_id = $1 AND student_id = $2 AND engagement_type = $3
              AND status IN ('in_progress', 'on_hold') AND deleted_at IS NULL
            LIMIT 1
            """,
            intake["family_id"], person_id, engagement_type,
        )
        if dup:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"An active {engagement_type} engagement already exists "
                    "for this student."
                ),
            )

        # Persist the chosen type so the row's dropdown remembers it even
        # after the engagement is later deleted.
        await conn.execute(
            """
            UPDATE intake_students
            SET recommended_engagement_type = $3, candidate = TRUE
            WHERE intake_id = $1 AND person_id = $2
            """,
            intake_id, person_id, engagement_type,
        )

        student = dict(student)
        student["recommended_engagement_type"] = engagement_type
        snapshot = _build_intake_snapshot(dict(intake), student)
        eng_id = await conn.fetchval(
            """
            INSERT INTO engagements (
              family_id, student_id, intake_id,
              engagement_type, status, start_date,
              lead_consultant_id, intake_snapshot
            ) VALUES ($1, $2, $3, $4, 'in_progress', CURRENT_DATE, $5, $6::jsonb)
            RETURNING id
            """,
            intake["family_id"], person_id, intake_id,
            engagement_type, user["id"], snapshot,
        )
        await seed_catalog_for_engagement(
            conn,
            engagement_id=eng_id,
            engagement_type=engagement_type,
            user_id=user["id"],
        )
        await conn.execute(
            "UPDATE intakes SET converted_at = NOW() WHERE id = $1 AND converted_at IS NULL",
            intake_id,
        )
        await conn.execute(
            "UPDATE families SET lifecycle_stage = 'client' WHERE id = $1",
            intake["family_id"],
        )

    return {"engagement_id": str(eng_id)}


# ---- soft delete ---------------------------------------------------------


@router.delete("/intakes/{intake_id}", status_code=204)
async def delete_intake(
    intake_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete. Engagements that linked back via intake_id are
    detached first so the soft-deleted intake stops appearing as the
    live origin for active work."""
    await _intake_or_404(conn, intake_id)
    async with conn.transaction():
        await conn.execute(
            "UPDATE engagements SET intake_id = NULL WHERE intake_id = $1",
            intake_id,
        )
        await conn.execute(
            "UPDATE intakes SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
            intake_id,
        )
    return None
