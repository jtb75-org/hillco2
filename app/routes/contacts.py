"""Contacts (school workers + ad-hoc others) — backed by the people spine.

After migration 0008 these records live in `people` (kind='school_worker'
when affiliated with a school, kind='other' otherwise) plus an optional
`school_worker_details` row with school_id + role for the affiliated
ones. The legacy `contacts` table is no longer authoritative; routes
preserve the legacy single-row API shape on the wire so the SPA and
school-visit attendee picker keep working unchanged.
"""
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

def _split_name(name: str) -> tuple[str, str | None]:
    name = (name or "").strip()
    if not name:
        return "", None
    parts = name.split(None, 1)
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[1].strip() or None


_LEGACY_SHAPE_SELECT = """
    SELECT
      p.id,
      TRIM(BOTH ' ' FROM
        COALESCE(p.first_name, '') ||
        CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
             THEN ' ' || p.last_name ELSE '' END
      )                                       AS name,
      swd.role,
      swd.school_id,
      s.name AS school_name,
      p.email, p.phone, p.notes,
      p.deleted_at,
      p.created_at, p.updated_at
    FROM people p
    LEFT JOIN school_worker_details swd ON swd.person_id = p.id
    LEFT JOIN schools s ON s.id = swd.school_id AND s.deleted_at IS NULL
"""

# Contacts in this endpoint are kind ∈ {school_worker, other}. Guardians
# and students live under their own routes.
_CONTACT_KIND_FILTER = "p.kind IN ('school_worker'::person_kind, 'other'::person_kind)"


async def _contact_or_404(conn, contact_id: UUID):
    row = await conn.fetchrow(
        _LEGACY_SHAPE_SELECT
        + f" WHERE p.id = $1 AND p.deleted_at IS NULL AND {_CONTACT_KIND_FILTER}",
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


async def _validate_school_exists(conn, school_id: UUID | None) -> None:
    if school_id is None:
        return
    if not await conn.fetchval(
        "SELECT 1 FROM schools WHERE id = $1 AND deleted_at IS NULL",
        school_id,
    ):
        raise HTTPException(
            status_code=400, detail="school_id does not match an active school"
        )


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
    clauses = ["p.deleted_at IS NULL", _CONTACT_KIND_FILTER]
    args: list = []
    q = q.strip()
    if q:
        args.append(f"%{q}%")
        slot = f"${len(args)}"
        clauses.append(
            f"(p.first_name ILIKE {slot} "
            f"OR COALESCE(p.last_name, '') ILIKE {slot} "
            f"OR COALESCE(swd.role, '') ILIKE {slot})"
        )
    if school_filter == "affiliated":
        clauses.append("swd.school_id IS NOT NULL")
    elif school_filter == "unaffiliated":
        clauses.append("swd.school_id IS NULL")

    if prefer_school_id is not None:
        args.append(prefer_school_id)
        rank_arg = f"${len(args)}"
        order_sql = f"""
        CASE
          WHEN swd.school_id = {rank_arg} THEN 0
          WHEN swd.school_id IS NULL      THEN 1
          ELSE                                  2
        END,
        p.last_name NULLS LAST, p.first_name
        """
    else:
        order_sql = "p.last_name NULLS LAST, p.first_name"

    args.append(limit)
    limit_arg = f"${len(args)}"

    rows = await conn.fetch(
        f"""
        SELECT p.id,
               TRIM(BOTH ' ' FROM
                 COALESCE(p.first_name, '') ||
                 CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                      THEN ' ' || p.last_name ELSE '' END
               )                                AS name,
               swd.role,
               p.email, p.phone,
               swd.school_id, s.name AS school_name,
               p.created_at, p.updated_at
        FROM people p
        LEFT JOIN school_worker_details swd ON swd.person_id = p.id
        LEFT JOIN schools s ON s.id = swd.school_id AND s.deleted_at IS NULL
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
    await _validate_school_exists(conn, fields.get("school_id"))

    first, last = _split_name(fields["name"])
    # School-affiliated contacts are kind='school_worker'; unaffiliated
    # ad-hoc contacts are kind='other'. Stays consistent with how
    # migration 0008 backfilled the existing data.
    kind = "school_worker" if fields.get("school_id") else "other"

    person_id = await conn.fetchval(
        """
        INSERT INTO people (kind, first_name, last_name, email, phone, notes)
        VALUES ($1::person_kind, $2, $3, $4, $5, $6)
        RETURNING id
        """,
        kind, first, last, fields["email"], fields["phone"], fields["notes"],
    )

    if fields.get("school_id"):
        await conn.execute(
            """
            INSERT INTO school_worker_details (person_id, school_id, role)
            VALUES ($1, $2, $3)
            """,
            person_id, fields["school_id"], fields["role"],
        )

    row = await conn.fetchrow(
        _LEGACY_SHAPE_SELECT + " WHERE p.id = $1",
        person_id,
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

    if "school_id" in fields:
        await _validate_school_exists(conn, fields["school_id"])

    # ---- people-side updates (name + simple text columns) ----------------
    people_updates: list[tuple[str, object]] = []
    if "name" in fields:
        first, last = _split_name(fields["name"])
        people_updates.append(("first_name", first))
        people_updates.append(("last_name", last))
    for col in ("email", "phone", "notes"):
        if col in fields:
            people_updates.append((col, fields[col]))

    if people_updates:
        set_sql = ", ".join(f"{col} = ${i+2}" for i, (col, _) in enumerate(people_updates))
        await conn.execute(
            f"UPDATE people SET {set_sql} WHERE id = $1",
            contact_id,
            *(v for _, v in people_updates),
        )

    # ---- school_worker_details + kind transitions -------------------------
    # If school_id is in the patch, it's the source of truth for kind:
    # adding a school_id promotes 'other' → 'school_worker' and upserts
    # details; clearing school_id demotes 'school_worker' → 'other' and
    # removes details. If only `role` changes, just update the row.
    if "school_id" in fields:
        if fields["school_id"] is not None:
            await conn.execute(
                "UPDATE people SET kind = 'school_worker'::person_kind WHERE id = $1",
                contact_id,
            )
            await conn.execute(
                """
                INSERT INTO school_worker_details (person_id, school_id, role)
                VALUES ($1, $2, $3)
                ON CONFLICT (person_id) DO UPDATE
                  SET school_id = EXCLUDED.school_id,
                      role      = COALESCE(EXCLUDED.role, school_worker_details.role)
                """,
                contact_id, fields["school_id"], fields.get("role"),
            )
        else:
            await conn.execute(
                "DELETE FROM school_worker_details WHERE person_id = $1",
                contact_id,
            )
            await conn.execute(
                "UPDATE people SET kind = 'other'::person_kind WHERE id = $1",
                contact_id,
            )
    elif "role" in fields:
        # Role-only update; only meaningful when the contact is
        # currently affiliated with a school.
        await conn.execute(
            "UPDATE school_worker_details SET role = $2 WHERE person_id = $1",
            contact_id, fields["role"],
        )

    row = await conn.fetchrow(
        _LEGACY_SHAPE_SELECT + " WHERE p.id = $1",
        contact_id,
    )
    return dict(row)


@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(
    contact_id: UUID,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete via people.deleted_at. school_visit_attendees
    references contacts (via people.id thanks to id preservation) so
    the row stays — the deleted_at filter hides it from listings."""
    if user["id"] == contact_id:
        # Self-delete on the /contacts page would lock the caller out
        # — auth_identities row stays, but auth_callback's joined
        # lookup would 500 trying to recreate it.
        raise HTTPException(
            status_code=400, detail="You can't delete your own account."
        )
    await _contact_or_404(conn, contact_id)
    await conn.execute(
        "UPDATE people SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        contact_id,
    )
    return None
