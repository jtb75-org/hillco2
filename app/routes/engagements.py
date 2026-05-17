import json
from datetime import date
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["engagements"])


# engagement_type is now a free-form code that must resolve to an
# `engagement_types(code)` row. Keep the field as plain str so the SPA
# can add new types via /api/engagement-types without a code change.
EngagementType = str
EngagementStatus = Literal["in_progress", "on_hold", "completed", "cancelled"]
StatusFilter = Literal["active", "completed", "cancelled", "all"]


# ---- I/O models ------------------------------------------------------------

async def _validate_engagement_type(conn, code: str) -> None:
    """Reject codes that don't resolve to a live engagement_types row."""
    if not await conn.fetchval(
        "SELECT 1 FROM engagement_types WHERE code = $1 AND deleted_at IS NULL",
        code,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Unknown engagement_type '{code}'.",
        )


class EngagementCreate(BaseModel):
    student_id: UUID
    engagement_type: EngagementType = "assessment"
    start_date: date | None = None
    target_end_date: date | None = None
    # The contract fee moved to agreements.amount in migration 0005;
    # creating an engagement no longer accepts a fee. Add a services
    # contract via POST /api/engagements/{id}/agreements instead.
    default_hourly_rate: Decimal | None = None
    lead_consultant_id: UUID | None = None  # defaults to the requester
    notes: str | None = None


class EngagementUpdate(BaseModel):
    engagement_type: EngagementType | None = None
    status: EngagementStatus | None = None
    start_date: date | None = None
    target_end_date: date | None = None
    default_hourly_rate: Decimal | None = None
    lead_consultant_id: UUID | None = None
    notes: str | None = None
    # Reassignment is rare but supported. Must belong to the same family;
    # the DB-level composite FK on (student_id, family_id) enforces this.
    student_id: UUID | None = None


class StatusUpdate(BaseModel):
    status: EngagementStatus


RequirementStatus = Literal["needed", "requested", "received", "waived"]


class RequirementCreate(BaseModel):
    kind: str = Field(..., min_length=1)
    value: str | None = None
    status: RequirementStatus | None = None
    notes: str | None = None


class RequirementUpdate(BaseModel):
    kind: str | None = Field(default=None, min_length=1)
    value: str | None = None
    status: RequirementStatus | None = None
    notes: str | None = None


# ---- Helpers ---------------------------------------------------------------

def _decode_jsonb(value: Any) -> Any:
    """asyncpg returns JSONB as a string by default. The frontend wants
    a real object, so decode here. Returns None / value unchanged if the
    column is NULL or already decoded."""
    if value is None or not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


async def _engagement_or_404(conn, engagement_id: UUID):
    row = await conn.fetchrow(
        """
        SELECT e.*, f.household_name AS family_household_name,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS lead_consultant_name
        FROM engagements e
        JOIN families f ON f.id = e.family_id AND f.deleted_at IS NULL
        LEFT JOIN people u ON u.id = e.lead_consultant_id
        WHERE e.id = $1 AND e.deleted_at IS NULL
        """,
        engagement_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return row


async def _validate_student_in_family(conn, student_id: UUID, family_id: UUID) -> None:
    """Refuse student/family combinations the DB's composite FK would reject.
    Reads from the new spine: a student is a kind='student' person whose
    family_students row points at the given family."""
    belongs = await conn.fetchval(
        """
        SELECT 1 FROM family_students fs
        JOIN people p ON p.id = fs.person_id
                     AND p.kind = 'student'
                     AND p.deleted_at IS NULL
        WHERE fs.person_id = $1 AND fs.family_id = $2
        """,
        student_id, family_id,
    )
    if not belongs:
        raise HTTPException(
            status_code=400,
            detail="student_id does not belong to this family.",
        )


async def _requirement_or_404(conn, requirement_id: UUID):
    row = await conn.fetchrow(
        "SELECT * FROM engagement_requirements WHERE id = $1",
        requirement_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return row


# ---- Engagement routes -----------------------------------------------------

@router.get("/engagements")
async def list_engagements(
    status: StatusFilter = Query(
        "active",
        description="active = in_progress|on_hold; completed; cancelled; all",
    ),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    if status == "active":
        clause = "AND e.status IN ('in_progress','on_hold')"
    elif status == "completed":
        clause = "AND e.status = 'completed'"
    elif status == "cancelled":
        clause = "AND e.status = 'cancelled'"
    else:
        clause = ""

    rows = await conn.fetch(
        f"""
        SELECT
          e.id, e.engagement_type, e.status, e.start_date, e.target_end_date,
          e.default_hourly_rate,
          f.id AS family_id, f.household_name,
          s.id AS student_id,
          TRIM(BOTH ' ' FROM COALESCE(s.first_name,'') || CASE WHEN s.last_name IS NOT NULL AND s.last_name <> '' THEN ' ' || s.last_name ELSE '' END) AS student_name,
          u.id AS lead_consultant_id,
          TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS lead_consultant_name
        FROM engagements e
        JOIN families f ON f.id = e.family_id AND f.deleted_at IS NULL
        LEFT JOIN people s ON s.id = e.student_id AND s.kind = 'student' AND s.deleted_at IS NULL
        LEFT JOIN people u ON u.id = e.lead_consultant_id
        WHERE e.deleted_at IS NULL {clause}
        ORDER BY e.start_date DESC NULLS LAST, e.id DESC
        """
    )
    return [dict(r) for r in rows]


@router.post("/families/{family_id}/engagements", status_code=201)
async def create_engagement(
    family_id: UUID,
    body: EngagementCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    if not await conn.fetchval(
        "SELECT 1 FROM families WHERE id = $1 AND deleted_at IS NULL",
        family_id,
    ):
        raise HTTPException(status_code=404, detail="Family not found")

    await _validate_student_in_family(conn, body.student_id, family_id)
    await _validate_engagement_type(conn, body.engagement_type)

    lead_id = body.lead_consultant_id or user["id"]
    notes = (body.notes or "").strip() or None

    eng_id = await conn.fetchval(
        """
        INSERT INTO engagements (
          family_id, student_id, engagement_type, status,
          start_date, target_end_date,
          default_hourly_rate, lead_consultant_id, notes
        ) VALUES ($1, $2, $3, 'in_progress', $4, $5, $6, $7, $8)
        RETURNING id
        """,
        family_id, body.student_id, body.engagement_type,
        body.start_date, body.target_end_date,
        body.default_hourly_rate, lead_id, notes,
    )

    return await engagement_detail(eng_id, _user=user, conn=conn)


@router.get("/engagements/{engagement_id}")
async def engagement_detail(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    engagement = await _engagement_or_404(conn, engagement_id)

    student = await conn.fetchrow(
        """
        SELECT
          p.id,
          TRIM(BOTH ' ' FROM
            COALESCE(p.first_name, '') ||
            CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                 THEN ' ' || p.last_name ELSE '' END
          )                  AS name,
          p.birthday          AS dob,
          sd.current_grade,
          sd.current_school_id
        FROM people p
        LEFT JOIN student_details sd ON sd.person_id = p.id
        WHERE p.id = $1 AND p.deleted_at IS NULL AND p.kind = 'student'
        """,
        engagement["student_id"],
    )

    requirements = await conn.fetch(
        """
        SELECT id, kind, value, status, notes, created_at, updated_at
        FROM engagement_requirements
        WHERE engagement_id = $1
        ORDER BY kind, id
        """,
        engagement_id,
    )

    finsum = await conn.fetchrow(
        "SELECT * FROM engagement_financial_summary WHERE engagement_id = $1",
        engagement_id,
    )

    counts = await conn.fetchrow(
        """
        SELECT
          (SELECT COUNT(*) FROM notes        WHERE engagement_id = $1)                                      AS notes,
          (SELECT COUNT(*) FROM followups    WHERE engagement_id = $1)                                      AS followups_total,
          (SELECT COUNT(*) FROM followups    WHERE engagement_id = $1 AND status = 'open')                  AS followups_open,
          (SELECT COUNT(*) FROM time_entries WHERE engagement_id = $1)                                      AS time_entries,
          (SELECT COUNT(*) FROM expenses     WHERE engagement_id = $1)                                      AS expenses,
          (SELECT COUNT(*) FROM school_visits WHERE engagement_id = $1)                                     AS school_visits,
          (SELECT COUNT(*) FROM school_recommendations WHERE engagement_id = $1)                            AS recommendations,
          (SELECT COUNT(*) FROM invoices     WHERE engagement_id = $1 AND deleted_at IS NULL)               AS invoices,
          (SELECT COUNT(*) FROM engagement_tasks WHERE engagement_id = $1)                                  AS tasks_total,
          (SELECT COUNT(*) FROM engagement_tasks WHERE engagement_id = $1 AND status = 'completed')         AS tasks_completed,
          (SELECT COUNT(*) FROM engagement_tasks WHERE engagement_id = $1 AND status = 'not_applicable')    AS tasks_na
        """,
        engagement_id,
    )

    out = dict(engagement)
    out["family"] = {
        "id": engagement["family_id"],
        "household_name": engagement["family_household_name"],
    }
    out.pop("family_household_name", None)
    out["lead_consultant"] = (
        {"id": engagement["lead_consultant_id"], "name": engagement["lead_consultant_name"]}
        if engagement["lead_consultant_name"] else None
    )
    out.pop("lead_consultant_name", None)
    out["student"] = dict(student) if student else None
    out["requirements"] = [dict(r) for r in requirements]
    out["financial_summary"] = dict(finsum) if finsum else None
    out["counts"] = dict(counts) if counts else None
    out["intake_snapshot"] = _decode_jsonb(out.get("intake_snapshot"))
    return out


@router.patch("/engagements/{engagement_id}")
async def update_engagement(
    engagement_id: UUID,
    body: EngagementUpdate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    eng = await _engagement_or_404(conn, engagement_id)

    fields = body.model_dump(exclude_unset=True)
    if "student_id" in fields:
        await _validate_student_in_family(conn, fields["student_id"], eng["family_id"])
    if "engagement_type" in fields:
        await _validate_engagement_type(conn, fields["engagement_type"])
    if "notes" in fields:
        fields["notes"] = (fields["notes"] or "").strip() or None

    if fields:
        set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
        await conn.execute(
            f"UPDATE engagements SET {set_sql} WHERE id = $1",
            engagement_id,
            *fields.values(),
        )

    return await engagement_detail(engagement_id, _user=user, conn=conn)


@router.post("/engagements/{engagement_id}/status")
async def update_status(
    engagement_id: UUID,
    body: StatusUpdate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Dedicated status-change endpoint — kept separate from PATCH so the
    SPA's status-pill control hits a clearly auditable action."""
    await _engagement_or_404(conn, engagement_id)
    await conn.execute(
        "UPDATE engagements SET status = $1::engagement_status WHERE id = $2",
        body.status, engagement_id,
    )
    return await engagement_detail(engagement_id, _user=user, conn=conn)


@router.delete("/engagements/{engagement_id}", status_code=204)
async def delete_engagement(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete: stamp engagements.deleted_at = NOW(). All queries
    in this module (and the SPA's downstream consumers) filter
    deleted_at IS NULL, so the engagement drops out of lists, search,
    family rollups, etc., but its agreements / invoices / notes / time
    entries stay intact for audit + accounting.

    Soft-delete sidesteps the FK RESTRICT constraints on agreements
    and invoices that previously made hard delete fail with a 409
    whenever any contract or invoice existed. The financial history
    is exactly what we want to preserve.

    If the deleted engagement came from an intake convert AND no other
    live engagements remain on that intake, clear intake.converted_at
    so the intake re-opens for another convert pass.
    """
    eng = await _engagement_or_404(conn, engagement_id)
    intake_id = eng["intake_id"]
    await conn.execute(
        "UPDATE engagements SET deleted_at = NOW() WHERE id = $1",
        engagement_id,
    )
    if intake_id is not None:
        remaining = await conn.fetchval(
            """
            SELECT 1 FROM engagements
            WHERE intake_id = $1 AND deleted_at IS NULL
            LIMIT 1
            """,
            intake_id,
        )
        if not remaining:
            await conn.execute(
                "UPDATE intakes SET converted_at = NULL WHERE id = $1",
                intake_id,
            )
    return None


# ---- Requirements (new in hillco2) -----------------------------------------

@router.get("/engagements/{engagement_id}/requirements")
async def list_requirements(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    rows = await conn.fetch(
        """
        SELECT id, engagement_id, kind, value, status, notes,
               created_at, updated_at
        FROM engagement_requirements
        WHERE engagement_id = $1
        ORDER BY kind, id
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


@router.post("/engagements/{engagement_id}/requirements", status_code=201)
async def add_requirement(
    engagement_id: UUID,
    body: RequirementCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    value = (body.value or "").strip() or None
    notes = (body.notes or "").strip() or None
    # If the operator created this row WITH a value already populated
    # and didn't explicitly set status, infer 'received' to match the
    # migration 0013 backfill rule. Otherwise let the DB default fire.
    status = body.status or ("received" if value else None)
    row = await conn.fetchrow(
        """
        INSERT INTO engagement_requirements (engagement_id, kind, value, status, notes)
        VALUES ($1, $2, $3, COALESCE($4, 'needed'), $5)
        RETURNING id, engagement_id, kind, value, status, notes,
                  created_at, updated_at
        """,
        engagement_id, body.kind.strip(), value, status, notes,
    )
    return dict(row)


@router.patch("/requirements/{requirement_id}")
async def update_requirement(
    requirement_id: UUID,
    body: RequirementUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _requirement_or_404(conn, requirement_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "kind" in fields:
        fields["kind"] = fields["kind"].strip()
    if "value" in fields:
        fields["value"] = (fields["value"] or "").strip() or None
    if "notes" in fields:
        fields["notes"] = (fields["notes"] or "").strip() or None

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    row = await conn.fetchrow(
        f"""
        UPDATE engagement_requirements SET {set_sql}
        WHERE id = $1
        RETURNING id, engagement_id, kind, value, status, notes,
                  created_at, updated_at
        """,
        requirement_id,
        *fields.values(),
    )
    return dict(row)


@router.delete("/requirements/{requirement_id}", status_code=204)
async def delete_requirement(
    requirement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _requirement_or_404(conn, requirement_id)
    await conn.execute("DELETE FROM engagement_requirements WHERE id = $1", requirement_id)
    return None
