"""Intake meetings — the family-level conversation that precedes one
or more engagements. See migration 0006 for the schema; one intake →
many engagements (e.g., a separate engagement per child)."""
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["intakes"])


StatusFilter = Literal["active", "completed", "all"]


class IntakeCreate(BaseModel):
    family_id: UUID
    intake_date: date | None = None  # defaults to today via DB default
    consultant_id: UUID | None = None  # defaults to the requester
    notes: str | None = None


class IntakeUpdate(BaseModel):
    intake_date: date | None = None
    consultant_id: UUID | None = None
    notes: str | None = None


async def _intake_or_404(conn, intake_id: UUID):
    row = await conn.fetchrow(
        "SELECT * FROM intakes WHERE id = $1 AND deleted_at IS NULL",
        intake_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Intake not found")
    return row


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
    list view can render each row without per-row roundtrips."""
    if status == "active":
        clause = "AND i.completed_at IS NULL"
    elif status == "completed":
        clause = "AND i.completed_at IS NOT NULL"
    else:
        clause = ""

    rows = await conn.fetch(
        f"""
        SELECT i.id, i.family_id, i.intake_date, i.consultant_id, i.notes,
               i.completed_at, i.created_at, i.updated_at,
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
    return dict(row)


@router.get("/intakes/{intake_id}")
async def get_intake(
    intake_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    intake = await _intake_or_404(conn, intake_id)
    out = dict(intake)
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
          sd.autism_level
        FROM intake_students is2
        JOIN people p ON p.id = is2.person_id AND p.deleted_at IS NULL
        LEFT JOIN student_details sd ON sd.person_id = p.id
        WHERE is2.intake_id = $1
        ORDER BY p.last_name NULLS LAST, p.first_name
        """,
        intake_id,
    )
    return [dict(r) for r in rows]


# ---- Intake member links ---------------------------------------------------


class MemberLink(BaseModel):
    person_id: UUID


async def _ensure_member_eligible(
    conn,
    intake_id: UUID,
    person_id: UUID,
    *,
    required_kind: str,
):
    """The intake-member endpoints can only link people who are
    already on the intake's family AND of the right kind (guardian /
    student). Anything else is a 400."""
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
    return [dict(r) for r in rows]


@router.patch("/intakes/{intake_id}")
async def update_intake(
    intake_id: UUID,
    body: IntakeUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _intake_or_404(conn, intake_id)
    fields = body.model_dump(exclude_unset=True)
    if "notes" in fields:
        fields["notes"] = (fields["notes"] or "").strip() or None
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    row = await conn.fetchrow(
        f"UPDATE intakes SET {set_sql} WHERE id = $1 RETURNING *",
        intake_id,
        *fields.values(),
    )
    return dict(row)


@router.post("/intakes/{intake_id}/complete")
async def complete_intake(
    intake_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Stamp `completed_at = NOW()`. Idempotent — re-completing an
    already-complete intake leaves the original timestamp in place."""
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
    return dict(row)


@router.post("/intakes/{intake_id}/reopen")
async def reopen_intake(
    intake_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Clear `completed_at`. No-op if it's already null."""
    await _intake_or_404(conn, intake_id)
    row = await conn.fetchrow(
        "UPDATE intakes SET completed_at = NULL WHERE id = $1 RETURNING *",
        intake_id,
    )
    return dict(row)


@router.delete("/intakes/{intake_id}", status_code=204)
async def delete_intake(
    intake_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete. Engagements that linked back via intake_id keep
    their reference (FK is ON DELETE SET NULL, but soft-delete just
    flips deleted_at — the FK still points)."""
    await _intake_or_404(conn, intake_id)
    await conn.execute(
        "UPDATE intakes SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        intake_id,
    )
    return None
