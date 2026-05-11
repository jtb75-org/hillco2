"""Unified address book reading the new `people` spine (migration 0008).

Today's three legacy tables (`parents`, `students`, `contacts` for school
workers) are still authoritative for the existing routes; migration 0008
created the new `people` table and backfilled it from those three. This
endpoint reads the new shape directly so the SPA's Contacts page can
treat everyone as one searchable list.

The legacy /api/contacts endpoint (school workers only) and the
/api/families/{id}/parents shape stay where they are. They get rewired
to read through `people` in a follow-up PR; nothing in those routes
needs to change for this one.
"""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["people"])

PersonKind = Literal["guardian", "student", "school_worker", "other"]


# ---- Response models ------------------------------------------------------

class PersonListRow(BaseModel):
    id: UUID
    kind: str
    first_name: str
    last_name: str | None
    email: str | None
    phone: str | None
    # Kind-dependent context — populated when applicable, NULL otherwise.
    # Saves the SPA from an N+1 follow-up fetch per row.
    family_id: UUID | None
    family_household_name: str | None
    family_is_archived: bool
    school_id: UUID | None
    school_name: str | None
    current_grade: str | None


# ---- Routes ---------------------------------------------------------------

@router.get("/people", response_model=list[PersonListRow])
async def list_people(
    kind: PersonKind | None = Query(
        None,
        description="Filter to one kind. None = all.",
    ),
    search: str = Query(
        "",
        description="Case-insensitive substring match against first/last/email.",
    ),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Unified address-book list. Supports kind filter + name/email
    search; returns up to 500 rows in alphabetical order. Page sizes
    above that are unrealistic for a homelab CRM and would push the
    SPA's table virtualization-or-pagination question we don't need
    to answer yet."""
    args: list = []
    where = ["p.deleted_at IS NULL"]
    if kind is not None:
        args.append(kind)
        where.append(f"p.kind = ${len(args)}::person_kind")
    if search.strip():
        args.append(f"%{search.strip().lower()}%")
        slot = f"${len(args)}"
        where.append(
            f"(LOWER(p.first_name) LIKE {slot} "
            f"OR LOWER(COALESCE(p.last_name,'')) LIKE {slot} "
            f"OR LOWER(COALESCE(p.email::text,'')) LIKE {slot})"
        )

    rows = await conn.fetch(
        f"""
        SELECT
          p.id, p.kind::text AS kind,
          p.first_name, p.last_name, p.email, p.phone,
          fg.family_id   AS guardian_family_id,
          fs.family_id   AS student_family_id,
          f.household_name AS family_household_name,
          (f.deleted_at IS NOT NULL) AS family_is_archived,
          swd.school_id,
          sch.name      AS school_name,
          sd.current_grade
        FROM people p
        LEFT JOIN family_guardians fg     ON fg.person_id = p.id
        LEFT JOIN family_students  fs     ON fs.person_id = p.id
        LEFT JOIN families f
               ON f.id = COALESCE(fg.family_id, fs.family_id)
        LEFT JOIN school_worker_details swd ON swd.person_id = p.id
        LEFT JOIN schools sch ON sch.id = swd.school_id AND sch.deleted_at IS NULL
        LEFT JOIN student_details sd      ON sd.person_id = p.id
        WHERE {" AND ".join(where)}
        ORDER BY p.last_name NULLS LAST, p.first_name
        LIMIT 500
        """,
        *args,
    )
    out: list[dict] = []
    for r in rows:
        out.append({
            "id": r["id"],
            "kind": r["kind"],
            "first_name": r["first_name"],
            "last_name": r["last_name"],
            "email": r["email"],
            "phone": r["phone"],
            # Collapse the two family junctions: guardians come from
            # family_guardians, students from family_students; a person
            # is in exactly one of these (or neither).
            "family_id": r["guardian_family_id"] or r["student_family_id"],
            "family_household_name": r["family_household_name"],
            "family_is_archived": bool(r["family_is_archived"]),
            "school_id": r["school_id"],
            "school_name": r["school_name"],
            "current_grade": r["current_grade"],
        })
    return out


@router.get("/people/{person_id}", response_model=PersonListRow)
async def person_detail(
    person_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    rows = await conn.fetch(
        """
        SELECT
          p.id, p.kind::text AS kind,
          p.first_name, p.last_name, p.email, p.phone,
          fg.family_id   AS guardian_family_id,
          fs.family_id   AS student_family_id,
          f.household_name AS family_household_name,
          (f.deleted_at IS NOT NULL) AS family_is_archived,
          swd.school_id,
          sch.name      AS school_name,
          sd.current_grade
        FROM people p
        LEFT JOIN family_guardians fg     ON fg.person_id = p.id
        LEFT JOIN family_students  fs     ON fs.person_id = p.id
        LEFT JOIN families f
               ON f.id = COALESCE(fg.family_id, fs.family_id)
        LEFT JOIN school_worker_details swd ON swd.person_id = p.id
        LEFT JOIN schools sch ON sch.id = swd.school_id AND sch.deleted_at IS NULL
        LEFT JOIN student_details sd      ON sd.person_id = p.id
        WHERE p.id = $1 AND p.deleted_at IS NULL
        """,
        person_id,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Person not found")
    r = rows[0]
    return {
        "id": r["id"],
        "kind": r["kind"],
        "first_name": r["first_name"],
        "last_name": r["last_name"],
        "email": r["email"],
        "phone": r["phone"],
        "family_id": r["guardian_family_id"] or r["student_family_id"],
        "family_household_name": r["family_household_name"],
        "school_id": r["school_id"],
        "school_name": r["school_name"],
        "current_grade": r["current_grade"],
    }
