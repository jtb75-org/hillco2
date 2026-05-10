from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["contacts"])

SchoolFilter = Literal["affiliated", "unaffiliated"]


# ---- I/O models ------------------------------------------------------------

class ContactBase(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    role: str | None = None
    school_id: UUID | None = None
    email: str | None = None
    phone: str | None = None
    notes: str | None = None


class ContactCreate(ContactBase):
    name: str = Field(..., min_length=1)


class ContactUpdate(ContactBase):
    pass


# ---- Helpers ---------------------------------------------------------------

async def _contact_or_404(conn, contact_id: UUID):
    row = await conn.fetchrow(
        """
        SELECT c.*, s.name AS school_name
        FROM contacts c
        LEFT JOIN schools s ON s.id = c.school_id AND s.deleted_at IS NULL
        WHERE c.id = $1 AND c.deleted_at IS NULL
        """,
        contact_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Contact not found")
    return row


def _normalize_strings(fields: dict) -> dict:
    for k, v in list(fields.items()):
        if isinstance(v, str):
            stripped = v.strip()
            fields[k] = stripped or None
    return fields


# ---- Routes ----------------------------------------------------------------

@router.get("/contacts")
async def list_contacts(
    q: str = Query("", description="Substring search over name + role"),
    school_filter: SchoolFilter | None = Query(
        None,
        description="affiliated = has school_id; unaffiliated = no school_id",
    ),
    prefer_school_id: UUID | None = Query(
        None,
        description=(
            "When set, contacts at this school sort first, then unaffiliated, "
            "then contacts at other schools. Used by the school-visit attendee "
            "typeahead so picks at the visiting school land at the top."
        ),
    ),
    limit: int = Query(200, ge=1, le=500),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    clauses = ["c.deleted_at IS NULL"]
    args: list = []
    q = q.strip()
    if q:
        args.append(f"%{q}%")
        clauses.append(
            f"(c.name ILIKE ${len(args)} OR COALESCE(c.role,'') ILIKE ${len(args)})"
        )
    if school_filter == "affiliated":
        clauses.append("c.school_id IS NOT NULL")
    elif school_filter == "unaffiliated":
        clauses.append("c.school_id IS NULL")

    if prefer_school_id is not None:
        args.append(prefer_school_id)
        rank_arg = f"${len(args)}"
        order_sql = f"""
        CASE
          WHEN c.school_id = {rank_arg} THEN 0
          WHEN c.school_id IS NULL       THEN 1
          ELSE                                2
        END,
        c.name
        """
    else:
        order_sql = "c.name"

    args.append(limit)
    limit_arg = f"${len(args)}"

    rows = await conn.fetch(
        f"""
        SELECT c.id, c.name, c.role, c.email, c.phone,
               c.school_id, s.name AS school_name,
               c.created_at, c.updated_at
        FROM contacts c
        LEFT JOIN schools s ON s.id = c.school_id AND s.deleted_at IS NULL
        WHERE {" AND ".join(clauses)}
        ORDER BY {order_sql}
        LIMIT {limit_arg}
        """,
        *args,
    )
    return [dict(r) for r in rows]


@router.post("/contacts", status_code=201)
async def create_contact(
    body: ContactCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    fields = _normalize_strings(body.model_dump())
    if fields.get("school_id"):
        if not await conn.fetchval(
            "SELECT 1 FROM schools WHERE id = $1 AND deleted_at IS NULL",
            fields["school_id"],
        ):
            raise HTTPException(status_code=400, detail="school_id does not match an active school")

    row = await conn.fetchrow(
        """
        INSERT INTO contacts (name, role, school_id, email, phone, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, role, school_id, email, phone, notes,
                  created_at, updated_at
        """,
        fields["name"],
        fields["role"],
        fields["school_id"],
        fields["email"],
        fields["phone"],
        fields["notes"],
    )
    return dict(row)


@router.get("/contacts/{contact_id}")
async def contact_detail(
    contact_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    contact = await _contact_or_404(conn, contact_id)
    visits = await conn.fetch(
        """
        SELECT v.id, v.visit_date, v.facts_notes, v.opinion_notes,
               e.id AS engagement_id,
               f.id AS family_id, f.household_name,
               s.id AS school_id, s.name AS school_name
        FROM school_visit_attendees a
        JOIN school_visits v ON v.id = a.school_visit_id
        JOIN engagements e ON e.id = v.engagement_id AND e.deleted_at IS NULL
        JOIN families f ON f.id = e.family_id AND f.deleted_at IS NULL
        JOIN schools s ON s.id = v.school_id
        WHERE a.contact_id = $1
        ORDER BY v.visit_date DESC, v.id DESC
        """,
        contact_id,
    )
    out = dict(contact)
    out["visits"] = [dict(v) for v in visits]
    return out


@router.patch("/contacts/{contact_id}")
async def update_contact(
    contact_id: UUID,
    body: ContactUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _contact_or_404(conn, contact_id)
    fields = _normalize_strings(body.model_dump(exclude_unset=True))
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "school_id" in fields and fields["school_id"] is not None:
        if not await conn.fetchval(
            "SELECT 1 FROM schools WHERE id = $1 AND deleted_at IS NULL",
            fields["school_id"],
        ):
            raise HTTPException(status_code=400, detail="school_id does not match an active school")

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    values = list(fields.values())
    row = await conn.fetchrow(
        f"""
        UPDATE contacts SET {set_sql} WHERE id = $1
        RETURNING id, name, role, school_id, email, phone, notes,
                  created_at, updated_at
        """,
        contact_id,
        *values,
    )
    return dict(row)


@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(
    contact_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete (sets deleted_at). school_visit_attendees references contacts
    via ON DELETE RESTRICT so the row stays — the deleted_at filter hides it."""
    await _contact_or_404(conn, contact_id)
    await conn.execute(
        "UPDATE contacts SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        contact_id,
    )
    return None
