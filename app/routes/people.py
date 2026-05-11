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
from pydantic import BaseModel, Field, field_validator

from ..auth import require_user
from ..db import get_conn
from ..validators import EMAIL_PATTERN, US_ZIP_PATTERN

router = APIRouter(prefix="/api", tags=["people"])

PersonKind = Literal["guardian", "student", "school_worker", "other"]
# Subset of kinds creatable via /api/people directly. `school_worker`
# is omitted because its supporting row (school_worker_details) has a
# NOT NULL school_id — those are created via the school flow instead.
CreatablePersonKind = Literal["guardian", "student", "other"]


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


class PersonFamilyMembership(BaseModel):
    family_id: UUID
    household_name: str
    is_archived: bool
    # "guardian:mom" | "guardian:dad" | "guardian:other" | "student"
    role: str


class PersonDetail(PersonListRow):
    """Single-person detail with all family memberships, the composed
    address blobs (for display), and the structured columns underneath
    (for editing). The drawer reads the structured fields directly so
    operators see individual inputs rather than a parsed blob."""
    memberships: list[PersonFamilyMembership]
    mailing_address: str | None
    billing_address: str | None
    # Structured mailing address columns.
    street1: str | None
    street2: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    country: str | None
    # Structured billing-override columns. Editable when the drawer's
    # "Use a different billing address" checkbox is on.
    billing_street1: str | None
    billing_street2: str | None
    billing_city: str | None
    billing_state: str | None
    billing_postal_code: str | None
    billing_country: str | None
    billing_attention_to: str | None


# ---- Request models -------------------------------------------------------


class PersonCreate(BaseModel):
    """Create a fresh address-book person. The supporting per-kind row
    is auto-inserted: kind='student' → empty student_details;
    kind='guardian' / 'other' → people row only."""
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    kind: CreatablePersonKind = "other"
    email: str | None = Field(default=None, pattern=EMAIL_PATTERN)
    phone: str | None = None
    street1: str | None = None
    street2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = Field(default=None, pattern=US_ZIP_PATTERN)
    country: str | None = None

    @field_validator("email", "postal_code", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v.strip() if isinstance(v, str) else v


class PersonUpdate(BaseModel):
    """Edit common fields on any person. Kind, birthday, and the
    family-side flags are intentionally out — those live on their
    specialized endpoints."""
    first_name: str | None = Field(default=None, min_length=1)
    last_name: str | None = Field(default=None, min_length=1)
    email: str | None = Field(default=None, pattern=EMAIL_PATTERN)
    phone: str | None = None
    street1: str | None = None
    street2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = Field(default=None, pattern=US_ZIP_PATTERN)
    country: str | None = None
    # Billing override — drawer surfaces these behind a "use a
    # different billing address" checkbox.
    billing_street1: str | None = None
    billing_street2: str | None = None
    billing_city: str | None = None
    billing_state: str | None = None
    billing_postal_code: str | None = Field(default=None, pattern=US_ZIP_PATTERN)
    billing_country: str | None = None
    billing_attention_to: str | None = None

    @field_validator("email", "postal_code", "billing_postal_code", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v.strip() if isinstance(v, str) else v


# Columns that are nullable text and round-trip blank → NULL on update.
_NULLABLE_TEXT_COLS = (
    "last_name", "email", "phone",
    "street1", "street2", "city", "state", "postal_code", "country",
    "billing_street1", "billing_street2", "billing_city",
    "billing_state", "billing_postal_code", "billing_country",
    "billing_attention_to",
)


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


@router.get("/people/{person_id}", response_model=PersonDetail)
async def person_detail(
    person_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    person = await conn.fetchrow(
        """
        SELECT
          p.id, p.kind::text AS kind,
          p.first_name, p.last_name, p.email, p.phone,
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
                            NULLIF(p.postal_code, ''))
                END,
                NULLIF(p.country, '')
              )
            ), ''
          )                                         AS mailing_address,
          NULLIF(
            TRIM(BOTH E'\n' FROM
              CONCAT_WS(E'\n',
                NULLIF(p.billing_street1, ''),
                NULLIF(p.billing_street2, ''),
                CASE WHEN COALESCE(p.billing_city, '') <> ''
                       OR COALESCE(p.billing_state, '') <> ''
                       OR COALESCE(p.billing_postal_code, '') <> ''
                     THEN CONCAT_WS(' ',
                            NULLIF(p.billing_city, ''),
                            NULLIF(p.billing_state, ''),
                            NULLIF(p.billing_postal_code, ''))
                END,
                NULLIF(p.billing_country, '')
              )
            ), ''
          )                                         AS billing_address,
          -- Structured columns for the drawer's individual inputs.
          p.street1, p.street2, p.city, p.state,
          p.postal_code, p.country,
          p.billing_street1, p.billing_street2, p.billing_city,
          p.billing_state, p.billing_postal_code, p.billing_country,
          p.billing_attention_to,
          swd.school_id,
          sch.name      AS school_name,
          sd.current_grade
        FROM people p
        LEFT JOIN school_worker_details swd ON swd.person_id = p.id
        LEFT JOIN schools sch ON sch.id = swd.school_id AND sch.deleted_at IS NULL
        LEFT JOIN student_details sd      ON sd.person_id = p.id
        WHERE p.id = $1 AND p.deleted_at IS NULL
        """,
        person_id,
    )
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    # All family memberships — a person can be a guardian on multiple
    # families (split households) or, less commonly, the student in two.
    memberships = await conn.fetch(
        """
        SELECT
          f.id AS family_id,
          f.household_name,
          (f.deleted_at IS NOT NULL) AS is_archived,
          CASE WHEN fg.person_id IS NOT NULL
               THEN 'guardian:' || fg.relationship::text
               ELSE 'student'
          END AS role
        FROM families f
        LEFT JOIN family_guardians fg
               ON fg.family_id = f.id AND fg.person_id = $1
        LEFT JOIN family_students fs
               ON fs.family_id = f.id AND fs.person_id = $1
        WHERE fg.person_id IS NOT NULL OR fs.person_id IS NOT NULL
        ORDER BY f.deleted_at NULLS FIRST, f.household_name
        """,
        person_id,
    )

    # Surface the "primary" family on the list-row shape — first active,
    # else first archived. Lets the SPA keep its existing list rendering.
    primary_membership = next(
        (m for m in memberships if not m["is_archived"]),
        memberships[0] if memberships else None,
    )

    return {
        "id": person["id"],
        "kind": person["kind"],
        "first_name": person["first_name"],
        "last_name": person["last_name"],
        "email": person["email"],
        "phone": person["phone"],
        "family_id": primary_membership["family_id"] if primary_membership else None,
        "family_household_name": (
            primary_membership["household_name"] if primary_membership else None
        ),
        "family_is_archived": bool(
            primary_membership["is_archived"]) if primary_membership else False,
        "school_id": person["school_id"],
        "school_name": person["school_name"],
        "current_grade": person["current_grade"],
        "mailing_address": person["mailing_address"],
        "billing_address": person["billing_address"],
        "street1": person["street1"],
        "street2": person["street2"],
        "city": person["city"],
        "state": person["state"],
        "postal_code": person["postal_code"],
        "country": person["country"],
        "billing_street1": person["billing_street1"],
        "billing_street2": person["billing_street2"],
        "billing_city": person["billing_city"],
        "billing_state": person["billing_state"],
        "billing_postal_code": person["billing_postal_code"],
        "billing_country": person["billing_country"],
        "billing_attention_to": person["billing_attention_to"],
        "memberships": [
            {
                "family_id": m["family_id"],
                "household_name": m["household_name"],
                "is_archived": bool(m["is_archived"]),
                "role": m["role"],
            }
            for m in memberships
        ],
    }


@router.post("/people", response_model=PersonListRow, status_code=201)
async def create_person(
    body: PersonCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Add a contact unaffiliated with any family at create time.
    Linking into a family happens later via the family detail page's
    Add parent / Add student flows (both of which support search-
    existing).

    For kind='student' we also insert an empty student_details row so
    the student page renders cleanly when the operator opens the
    contact next; for the other kinds we skip — no supporting row
    needed."""
    person_id = await conn.fetchval(
        """
        INSERT INTO people (
          kind, first_name, last_name, email, phone,
          street1, street2, city, state, postal_code, country
        ) VALUES (
          $1::person_kind, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11
        )
        RETURNING id
        """,
        body.kind,
        body.first_name.strip(),
        body.last_name.strip(),
        body.email,
        (body.phone or "").strip() or None,
        (body.street1 or "").strip() or None,
        (body.street2 or "").strip() or None,
        (body.city or "").strip() or None,
        (body.state or "").strip() or None,
        body.postal_code,
        (body.country or "").strip() or None,
    )
    if body.kind == "student":
        await conn.execute(
            "INSERT INTO student_details (person_id) VALUES ($1) "
            "ON CONFLICT (person_id) DO NOTHING",
            person_id,
        )
    # Reuse the list query for the response so the SPA gets the same
    # shape it sees in /api/people.
    row = await conn.fetchrow(
        """
        SELECT
          p.id, p.kind::text AS kind,
          p.first_name, p.last_name, p.email, p.phone,
          NULL::uuid AS family_id, NULL::text AS family_household_name,
          FALSE AS family_is_archived,
          NULL::uuid AS school_id, NULL::text AS school_name,
          NULL::text AS current_grade
        FROM people p WHERE p.id = $1
        """,
        person_id,
    )
    return dict(row)


@router.patch("/people/{person_id}", response_model=PersonListRow)
async def update_person(
    person_id: UUID,
    body: PersonUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Patch common fields on a person. kind is intentionally not
    editable — switching kinds would orphan or duplicate supporting
    rows. Blank strings normalize to NULL for nullable text columns;
    first_name / last_name reject blank entirely."""
    person = await conn.fetchrow(
        "SELECT id FROM people WHERE id = $1 AND deleted_at IS NULL",
        person_id,
    )
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    for required_col in ("first_name", "last_name"):
        if required_col in fields:
            fields[required_col] = (fields[required_col] or "").strip()
            if not fields[required_col]:
                raise HTTPException(
                    status_code=422,
                    detail=f"{required_col} cannot be blank",
                )
    for col in _NULLABLE_TEXT_COLS:
        if col in fields and fields[col] is not None and isinstance(fields[col], str):
            fields[col] = fields[col].strip() or None

    set_sql = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(fields))
    await conn.execute(
        f"UPDATE people SET {set_sql} WHERE id = $1",
        person_id,
        *fields.values(),
    )

    row = await conn.fetchrow(
        """
        SELECT
          p.id, p.kind::text AS kind,
          p.first_name, p.last_name, p.email, p.phone,
          fg.family_id AS guardian_family_id,
          fs.family_id AS student_family_id,
          f.household_name AS family_household_name,
          (f.deleted_at IS NOT NULL) AS family_is_archived,
          swd.school_id, sch.name AS school_name,
          sd.current_grade
        FROM people p
        LEFT JOIN family_guardians fg ON fg.person_id = p.id
        LEFT JOIN family_students  fs ON fs.person_id = p.id
        LEFT JOIN families f
               ON f.id = COALESCE(fg.family_id, fs.family_id)
        LEFT JOIN school_worker_details swd ON swd.person_id = p.id
        LEFT JOIN schools sch ON sch.id = swd.school_id AND sch.deleted_at IS NULL
        LEFT JOIN student_details sd ON sd.person_id = p.id
        WHERE p.id = $1
        """,
        person_id,
    )
    r = dict(row)
    r["family_id"] = r.pop("guardian_family_id") or r.pop("student_family_id")
    r["family_is_archived"] = bool(r["family_is_archived"])
    return r


@router.delete("/people/{person_id}", status_code=204)
async def delete_person(
    person_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft-delete by setting people.deleted_at. The family-detail
    queries already filter `p.deleted_at IS NULL`, so the person
    vanishes from rosters automatically. Junction rows in
    family_guardians / family_students stay intact in case the
    operator restores."""
    exists = await conn.fetchval(
        "SELECT 1 FROM people WHERE id = $1 AND deleted_at IS NULL",
        person_id,
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Person not found")
    await conn.execute(
        "UPDATE people SET deleted_at = NOW() WHERE id = $1",
        person_id,
    )
    return None
