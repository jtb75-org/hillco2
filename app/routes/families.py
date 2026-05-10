from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

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
    # When `person_id` is set, link the existing person as a guardian
    # of this family — name/email/phone/address fields are ignored; the
    # person's own record stays the source of truth. When absent, a new
    # `people` row is created from `name`+contact fields.
    person_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1)
    email: str | None = None
    phone: str | None = None
    # Mailing address — structured. Each field maps 1:1 to people.
    # Empty/whitespace strings normalize to NULL.
    street1: str | None = None
    street2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    role: ParentRole = "other"
    is_primary_contact: bool = False
    is_billing_contact: bool = False
    # Billing override — only relevant when is_billing_contact=True.
    # Used when invoices physically go to a different address than the
    # person's mailing address.
    billing_street1: str | None = None
    billing_street2: str | None = None
    billing_city: str | None = None
    billing_state: str | None = None
    billing_postal_code: str | None = None
    billing_country: str | None = None
    billing_attention_to: str | None = None

    @model_validator(mode="after")
    def _name_or_person_id(self):
        if self.person_id is None and not (self.name or "").strip():
            raise ValueError("Either person_id or name is required.")
        return self


class ParentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    email: str | None = None
    phone: str | None = None
    street1: str | None = None
    street2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    role: ParentRole | None = None
    is_primary_contact: bool | None = None
    is_billing_contact: bool | None = None
    billing_street1: str | None = None
    billing_street2: str | None = None
    billing_city: str | None = None
    billing_state: str | None = None
    billing_postal_code: str | None = None
    billing_country: str | None = None
    billing_attention_to: str | None = None


# Address columns that round-trip through the API as their structured
# selves; empty/whitespace strings normalize to NULL on read+write.
_MAILING_ADDR_COLS = ("street1", "street2", "city", "state", "postal_code", "country")
_BILLING_ADDR_COLS = (
    "billing_street1", "billing_street2", "billing_city",
    "billing_state", "billing_postal_code", "billing_country",
)


def _strip_or_null(s: str | None) -> str | None:
    return (s or "").strip() or None


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
    """Read parents from the new people + family_guardians spine but
    return rows in the legacy `parents`-shape so existing API contract
    (and the SPA) keep working: composes a single `name` from
    first_name + last_name, and the billing_address blob from the
    structured billing_* fields. Migration 0009 added
    billing_attention_to to people; 0011 will drop the legacy parents
    table once nothing reads it."""
    return await conn.fetch(
        """
        SELECT
          p.id,
          fg.family_id,
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
                            NULLIF(p.postal_code, ''))
                END,
                NULLIF(p.country, '')
              )
            ), '')                                AS mailing_address,
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
            ), '')                                AS billing_address,
          p.billing_attention_to,
          fg.created_at, fg.updated_at
        FROM family_guardians fg
        JOIN people p ON p.id = fg.person_id AND p.deleted_at IS NULL
        WHERE fg.family_id = $1
        ORDER BY fg.is_primary_contact DESC, p.last_name NULLS LAST, p.first_name
        """,
        family_id,
    )


def _split_name(name: str) -> tuple[str, str | None]:
    """Best-effort split of a single name string into (first, last).
    Single-token names land entirely in first; whitespace-only is
    treated as empty string in first."""
    name = (name or "").strip()
    if not name:
        return "", None
    parts = name.split(None, 1)
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[1].strip() or None


async def _parent_or_404(conn, parent_id: UUID):
    """`parent_id` here is the people.id (= family_guardians.person_id);
    legacy parents.id used the same UUIDs by 0008's id-preservation, so
    inbound URLs from the SPA still resolve."""
    row = await conn.fetchrow(
        """
        SELECT fg.family_id, p.id AS person_id
        FROM family_guardians fg
        JOIN people p ON p.id = fg.person_id AND p.deleted_at IS NULL
        WHERE fg.person_id = $1
        """,
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
          pp.id   AS primary_parent_id,
          TRIM(BOTH ' ' FROM
            COALESCE(pp.first_name, '') ||
            CASE WHEN pp.last_name IS NOT NULL AND pp.last_name <> ''
                 THEN ' ' || pp.last_name ELSE '' END
          )       AS primary_parent_name,
          (SELECT COUNT(*) FROM family_students fs
             JOIN people sp ON sp.id = fs.person_id
                          AND sp.kind = 'student'
                          AND sp.deleted_at IS NULL
             WHERE fs.family_id = f.id) AS student_count,
          (SELECT COUNT(*) FROM family_guardians fg
             WHERE fg.family_id = f.id) AS parent_count,
          (SELECT COUNT(*) FROM engagements e
             WHERE e.family_id = f.id AND e.deleted_at IS NULL
               AND e.status IN ('in_progress','on_hold')) AS active_engagements
        FROM families f
        -- Partial UNIQUE on family_guardians (family_id) WHERE
        -- is_primary_contact guarantees this LEFT JOIN matches at most
        -- one row per family. Compose the legacy `pp.name` shape from
        -- people first/last on the way out.
        LEFT JOIN family_guardians fg
               ON fg.family_id = f.id AND fg.is_primary_contact
        LEFT JOIN people pp
               ON pp.id = fg.person_id AND pp.deleted_at IS NULL
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
        SELECT
          p.id,
          TRIM(BOTH ' ' FROM
            COALESCE(p.first_name, '') ||
            CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                 THEN ' ' || p.last_name ELSE '' END
          )                                       AS name,
          p.birthday                              AS dob,
          sd.current_grade,
          sd.current_school_id
        FROM family_students fs
        JOIN people p ON p.id = fs.person_id
                     AND p.kind = 'student'
                     AND p.deleted_at IS NULL
        LEFT JOIN student_details sd ON sd.person_id = p.id
        WHERE fs.family_id = $1
        ORDER BY p.last_name NULLS LAST, p.first_name
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
        # Convenience pointers for the SPA's billing/contact blocks.
        # Both are None when no parent is flagged — partial UNIQUE only
        # blocks two, not zero.
        "primary_parent_id": next(
            (p["id"] for p in parents if p["is_primary_contact"]), None,
        ),
        "billing_parent_id": next(
            (p["id"] for p in parents if p["is_billing_contact"]), None,
        ),
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

    # Normalize: trim strings, blank → NULL.
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

    if body.person_id is not None:
        # Link mode: person already exists, just attach to this family.
        target = await conn.fetchrow(
            "SELECT kind::text AS kind FROM people WHERE id = $1 AND deleted_at IS NULL",
            body.person_id,
        )
        if not target:
            raise HTTPException(status_code=404, detail="Person not found")
        if target["kind"] == "student":
            raise HTTPException(
                status_code=400,
                detail="A student record can't also be a guardian.",
            )
        already_linked = await conn.fetchval(
            "SELECT 1 FROM family_guardians WHERE family_id = $1 AND person_id = $2",
            family_id, body.person_id,
        )
        if already_linked:
            raise HTTPException(
                status_code=409,
                detail="This person is already a guardian on this family.",
            )
        person_id = body.person_id
    else:
        person_id = None  # set below after INSERT

    # Demote competing flag-holders before promoting this row, same as the
    # legacy code did — partial UNIQUEs on family_guardians (family_id)
    # WHERE is_primary_contact / is_billing_contact would otherwise reject
    # the second insert.
    if body.is_primary_contact:
        await conn.execute(
            "UPDATE family_guardians SET is_primary_contact = FALSE WHERE family_id = $1",
            family_id,
        )
    if body.is_billing_contact:
        await conn.execute(
            "UPDATE family_guardians SET is_billing_contact = FALSE WHERE family_id = $1",
            family_id,
        )

    if person_id is None:
        first, last = _split_name(body.name or "")
        person_id = await conn.fetchval(
            """
            INSERT INTO people (
              kind, first_name, last_name, email, phone,
              street1, street2, city, state, postal_code, country,
              billing_street1, billing_street2, billing_city, billing_state,
              billing_postal_code, billing_country, billing_attention_to
            ) VALUES (
              'guardian', $1, $2, NULLIF($3,''), NULLIF($4,''),
              $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17
            )
            RETURNING id
            """,
            first, last,
            (body.email or "").strip(),
            (body.phone or "").strip(),
            _strip_or_null(body.street1), _strip_or_null(body.street2),
            _strip_or_null(body.city), _strip_or_null(body.state),
            _strip_or_null(body.postal_code), _strip_or_null(body.country),
            _strip_or_null(body.billing_street1), _strip_or_null(body.billing_street2),
            _strip_or_null(body.billing_city), _strip_or_null(body.billing_state),
            _strip_or_null(body.billing_postal_code), _strip_or_null(body.billing_country),
            _strip_or_null(body.billing_attention_to),
        )
    await conn.execute(
        """
        INSERT INTO family_guardians (
          family_id, person_id, relationship,
          is_primary_contact, is_billing_contact
        ) VALUES ($1, $2, $3, $4, $5)
        """,
        family_id, person_id, body.role,
        body.is_primary_contact, body.is_billing_contact,
    )

    # Return the legacy parents-shape via the same helper the family
    # detail endpoint uses, then pluck the inserted row.
    rows = await _parents_for_family(conn, family_id)
    return next(dict(r) for r in rows if r["id"] == person_id)


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

    # Normalize text fields: trim, empty-to-NULL.
    if "name" in fields:
        fields["name"] = (fields["name"] or "").strip()
    nullable_text_cols = (
        "email", "phone", "billing_attention_to",
        *_MAILING_ADDR_COLS, *_BILLING_ADDR_COLS,
    )
    for col in nullable_text_cols:
        if col in fields:
            fields[col] = _strip_or_null(fields[col])

    # Demote any other holder of either flag before promoting this row.
    # Legacy code did this on `parents`; same shape on family_guardians.
    for flag in ("is_primary_contact", "is_billing_contact"):
        if fields.get(flag) is True:
            await conn.execute(
                f"UPDATE family_guardians SET {flag} = FALSE WHERE family_id = $1 AND person_id <> $2",
                parent["family_id"],
                parent_id,
            )

    # Split the patch: people-side columns (name/email/phone/billing) vs
    # family_guardians-side columns (role/flags). Each table updates only
    # if it has at least one field to set.
    people_updates: list[tuple[str, object]] = []
    if "name" in fields:
        first, last = _split_name(fields["name"])
        people_updates.append(("first_name", first))
        people_updates.append(("last_name", last))
    if "email" in fields:
        people_updates.append(("email", fields["email"]))
    if "phone" in fields:
        people_updates.append(("phone", fields["phone"]))
    for col in (*_MAILING_ADDR_COLS, *_BILLING_ADDR_COLS, "billing_attention_to"):
        if col in fields:
            people_updates.append((col, fields[col]))

    if people_updates:
        set_sql = ", ".join(f"{col} = ${i+2}" for i, (col, _) in enumerate(people_updates))
        await conn.execute(
            f"UPDATE people SET {set_sql} WHERE id = $1",
            parent_id,
            *(v for _, v in people_updates),
        )

    fg_updates: list[tuple[str, object]] = []
    if "role" in fields:
        fg_updates.append(("relationship", fields["role"]))
    for flag in ("is_primary_contact", "is_billing_contact"):
        if flag in fields:
            fg_updates.append((flag, fields[flag]))

    if fg_updates:
        set_sql = ", ".join(f"{col} = ${i+3}" for i, (col, _) in enumerate(fg_updates))
        await conn.execute(
            f"UPDATE family_guardians SET {set_sql} WHERE family_id = $1 AND person_id = $2",
            parent["family_id"], parent_id,
            *(v for _, v in fg_updates),
        )

    rows = await _parents_for_family(conn, parent["family_id"])
    return next(dict(r) for r in rows if r["id"] == parent_id)


@router.delete("/parents/{parent_id}", status_code=204)
async def delete_parent(
    parent_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Detach the person from the family. The person row stays in
    `people` (and any audit_log entries referencing this id remain
    valid); only the family_guardians junction row is removed. If
    you want to fully remove the person from the address book,
    soft-delete via people.deleted_at — a future endpoint."""
    parent = await _parent_or_404(conn, parent_id)
    await conn.execute(
        "DELETE FROM family_guardians WHERE family_id = $1 AND person_id = $2",
        parent["family_id"], parent_id,
    )
    return None
