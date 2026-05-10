from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["families"])

ParentRole = Literal["mom", "dad", "guardian", "other"]


# ---- I/O models ------------------------------------------------------------

class FamilyCreate(BaseModel):
    household_name: str = Field(..., min_length=1)
    notes: str | None = None


class FamilyUpdate(BaseModel):
    household_name: str | None = Field(default=None, min_length=1)
    notes: str | None = None


class ParentCreate(BaseModel):
    name: str = Field(..., min_length=1)
    email: str | None = None
    phone: str | None = None
    role: ParentRole = "other"
    is_primary_contact: bool = False


class ParentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    email: str | None = None
    phone: str | None = None
    role: ParentRole | None = None
    is_primary_contact: bool | None = None


# ---- Helpers ---------------------------------------------------------------

async def _family_or_404(conn, family_id: UUID):
    row = await conn.fetchrow(
        "SELECT * FROM families WHERE id = $1 AND deleted_at IS NULL",
        family_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Family not found")
    return row


async def _parents_for_family(conn, family_id: UUID):
    return await conn.fetch(
        """
        SELECT id, family_id, name, email, phone, role, is_primary_contact,
               created_at, updated_at
        FROM parents
        WHERE family_id = $1
        ORDER BY is_primary_contact DESC, name
        """,
        family_id,
    )


async def _parent_or_404(conn, parent_id: UUID):
    row = await conn.fetchrow(
        "SELECT * FROM parents WHERE id = $1",
        parent_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Parent not found")
    return row


# ---- Family routes ---------------------------------------------------------

@router.get("/families")
async def list_families(_user=Depends(require_user), conn=Depends(get_conn)):
    rows = await conn.fetch(
        """
        SELECT
          f.id, f.household_name, f.notes, f.created_at, f.updated_at,
          (SELECT COUNT(*) FROM students s
             WHERE s.family_id = f.id AND s.deleted_at IS NULL) AS student_count,
          (SELECT COUNT(*) FROM parents  p
             WHERE p.family_id = f.id) AS parent_count,
          (SELECT COUNT(*) FROM engagements e
             WHERE e.family_id = f.id AND e.deleted_at IS NULL
               AND e.status IN ('in_progress','on_hold')) AS active_engagements
        FROM families f
        WHERE f.deleted_at IS NULL
        ORDER BY f.household_name
        """
    )
    return [dict(r) for r in rows]


@router.post("/families", status_code=201)
async def create_family(
    body: FamilyCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    row = await conn.fetchrow(
        """
        INSERT INTO families (household_name, notes)
        VALUES ($1, $2)
        RETURNING id, household_name, notes, created_at, updated_at
        """,
        body.household_name.strip(),
        (body.notes or "").strip() or None,
    )
    return dict(row)


@router.get("/families/{family_id}")
async def family_detail(
    family_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    family = await _family_or_404(conn, family_id)
    parents = await _parents_for_family(conn, family_id)
    # Stub-shape lists for related resources; full detail via the resources'
    # own endpoints (/api/students/{id}, /api/engagements/{id}).
    students = await conn.fetch(
        """
        SELECT id, name, dob, current_grade, current_school_id
        FROM students
        WHERE family_id = $1 AND deleted_at IS NULL
        ORDER BY name
        """,
        family_id,
    )
    engagements = await conn.fetch(
        """
        SELECT id, engagement_type, status, start_date, target_end_date
        FROM engagements
        WHERE family_id = $1 AND deleted_at IS NULL
        ORDER BY start_date DESC NULLS LAST, id DESC
        """,
        family_id,
    )
    return {
        **dict(family),
        "parents": [dict(p) for p in parents],
        "students": [dict(s) for s in students],
        "engagements": [dict(e) for e in engagements],
    }


@router.patch("/families/{family_id}")
async def update_family(
    family_id: UUID,
    body: FamilyUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _family_or_404(conn, family_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Normalize: empty notes -> NULL, household_name trimmed
    if "household_name" in fields:
        fields["household_name"] = fields["household_name"].strip()
    if "notes" in fields:
        fields["notes"] = (fields["notes"] or "").strip() or None

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    values = list(fields.values())
    row = await conn.fetchrow(
        f"UPDATE families SET {set_sql} WHERE id = $1 RETURNING id, household_name, notes, created_at, updated_at",
        family_id,
        *values,
    )
    return dict(row)


@router.delete("/families/{family_id}", status_code=204)
async def delete_family(
    family_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft-delete (sets deleted_at). Engagements still reference the family
    via ON DELETE RESTRICT, so the row stays — the deleted_at filter just
    hides it from listings."""
    await _family_or_404(conn, family_id)
    await conn.execute(
        "UPDATE families SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        family_id,
    )
    return None


# ---- Parent routes ---------------------------------------------------------

@router.post("/families/{family_id}/parents", status_code=201)
async def add_parent(
    family_id: UUID,
    body: ParentCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _family_or_404(conn, family_id)
    if body.is_primary_contact:
        await conn.execute(
            "UPDATE parents SET is_primary_contact = FALSE WHERE family_id = $1",
            family_id,
        )
    row = await conn.fetchrow(
        """
        INSERT INTO parents (family_id, name, email, phone, role, is_primary_contact)
        VALUES ($1, $2, NULLIF($3,''), NULLIF($4,''), $5, $6)
        RETURNING id, family_id, name, email, phone, role, is_primary_contact,
                  created_at, updated_at
        """,
        family_id,
        body.name.strip(),
        (body.email or "").strip(),
        (body.phone or "").strip(),
        body.role,
        body.is_primary_contact,
    )
    return dict(row)


@router.patch("/parents/{parent_id}")
async def update_parent(
    parent_id: UUID,
    body: ParentUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    parent = await _parent_or_404(conn, parent_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "name" in fields:
        fields["name"] = fields["name"].strip()
    for empty_to_null_col in ("email", "phone"):
        if empty_to_null_col in fields:
            fields[empty_to_null_col] = (fields[empty_to_null_col] or "").strip() or None

    # If toggling is_primary_contact to True, demote any other primary in the
    # same family first — keeps the "exactly one primary" invariant the form
    # implied without enforcing it in the schema.
    if fields.get("is_primary_contact") is True:
        await conn.execute(
            "UPDATE parents SET is_primary_contact = FALSE WHERE family_id = $1 AND id <> $2",
            parent["family_id"],
            parent_id,
        )

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    values = list(fields.values())
    row = await conn.fetchrow(
        f"""
        UPDATE parents SET {set_sql}
        WHERE id = $1
        RETURNING id, family_id, name, email, phone, role, is_primary_contact,
                  created_at, updated_at
        """,
        parent_id,
        *values,
    )
    return dict(row)


@router.delete("/parents/{parent_id}", status_code=204)
async def delete_parent(
    parent_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Hard delete — parents have no deleted_at column. The schema cascades
    appropriately (ON DELETE CASCADE from families covers the family-deletion
    case; this endpoint is for explicit per-row removal)."""
    parent = await _parent_or_404(conn, parent_id)
    await conn.execute("DELETE FROM parents WHERE id = $1", parent_id)
    _ = parent
    return None
