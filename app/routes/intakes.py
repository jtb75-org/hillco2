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
    return dict(await _intake_or_404(conn, intake_id))


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
