from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["schools"])


# ---- I/O models ------------------------------------------------------------

class SchoolBase(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    location: str | None = None
    school_type: str | None = None
    grade_range_low: str | None = None
    grade_range_high: str | None = None
    website: str | None = None
    fit_profile: str | None = None
    notes: str | None = None

    @field_validator("website")
    @classmethod
    def _validate_website(cls, v: str | None) -> str | None:
        """Reject anything that isn't an http(s) URL.

        Empty string -> None (drops to NULL on the way to SQL). Letting
        `javascript:` or `data:` URIs land in this field would be a stored
        XSS waiting for a template-side guard regression to render it as
        a clickable link."""
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        parsed = urlparse(v)
        if parsed.scheme.lower() not in ("http", "https"):
            raise ValueError("website must be an http(s) URL")
        if not parsed.netloc:
            raise ValueError("website is missing a hostname")
        return v


class SchoolCreate(SchoolBase):
    name: str = Field(..., min_length=1)


class SchoolUpdate(SchoolBase):
    pass


# ---- Helpers ---------------------------------------------------------------

async def _school_or_404(conn, school_id: UUID):
    row = await conn.fetchrow(
        "SELECT * FROM schools WHERE id = $1 AND deleted_at IS NULL",
        school_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="School not found")
    return row


def _normalize_strings(fields: dict) -> dict:
    """Trim strings; empty strings -> None (NULL in SQL)."""
    for k, v in list(fields.items()):
        if isinstance(v, str):
            stripped = v.strip()
            fields[k] = stripped or None
    return fields


# ---- Routes ----------------------------------------------------------------

@router.get("/schools")
async def list_schools(
    q: str = Query("", description="Substring search over name + location"),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    q = q.strip()
    if q:
        rows = await conn.fetch(
            """
            SELECT s.id, s.name, s.location, s.school_type,
                   s.grade_range_low, s.grade_range_high, s.website,
                   s.created_at, s.updated_at,
                   (SELECT COUNT(*) FROM school_visits v
                      WHERE v.school_id = s.id) AS visit_count,
                   (SELECT COUNT(*) FROM contacts c
                      WHERE c.school_id = s.id AND c.deleted_at IS NULL) AS contact_count
            FROM schools s
            WHERE s.deleted_at IS NULL
              AND (s.name ILIKE $1 OR COALESCE(s.location,'') ILIKE $1)
            ORDER BY s.name
            """,
            f"%{q}%",
        )
    else:
        rows = await conn.fetch(
            """
            SELECT s.id, s.name, s.location, s.school_type,
                   s.grade_range_low, s.grade_range_high, s.website,
                   s.created_at, s.updated_at,
                   (SELECT COUNT(*) FROM school_visits v
                      WHERE v.school_id = s.id) AS visit_count,
                   (SELECT COUNT(*) FROM contacts c
                      WHERE c.school_id = s.id AND c.deleted_at IS NULL) AS contact_count
            FROM schools s
            WHERE s.deleted_at IS NULL
            ORDER BY s.name
            """
        )
    return [dict(r) for r in rows]


@router.post("/schools", status_code=201)
async def create_school(
    body: SchoolCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    fields = _normalize_strings(body.model_dump())
    row = await conn.fetchrow(
        """
        INSERT INTO schools (
          name, location, school_type, grade_range_low, grade_range_high,
          website, fit_profile, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        """,
        fields["name"],
        fields["location"],
        fields["school_type"],
        fields["grade_range_low"],
        fields["grade_range_high"],
        fields["website"],
        fields["fit_profile"],
        fields["notes"],
    )
    return dict(row)


@router.get("/schools/{school_id}")
async def school_detail(
    school_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    school = await _school_or_404(conn, school_id)

    visits = await conn.fetch(
        """
        SELECT v.id, v.visit_date, v.attendees, v.hours,
               v.facts_notes, v.opinion_notes,
               e.id AS engagement_id,
               f.id AS family_id, f.household_name
        FROM school_visits v
        JOIN engagements e ON e.id = v.engagement_id AND e.deleted_at IS NULL
        JOIN families f ON f.id = e.family_id AND f.deleted_at IS NULL
        WHERE v.school_id = $1
        ORDER BY v.visit_date DESC, v.id DESC
        """,
        school_id,
    )

    recommendations = await conn.fetch(
        """
        SELECT r.id, r.rank, r.status, r.notes, r.created_at,
               e.id AS engagement_id,
               f.id AS family_id, f.household_name
        FROM school_recommendations r
        JOIN engagements e ON e.id = r.engagement_id AND e.deleted_at IS NULL
        JOIN families f ON f.id = e.family_id AND f.deleted_at IS NULL
        WHERE r.school_id = $1
        ORDER BY r.created_at DESC
        """,
        school_id,
    )

    staff = await conn.fetch(
        """
        SELECT id, name, role, email, phone
        FROM contacts
        WHERE school_id = $1 AND deleted_at IS NULL
        ORDER BY name
        """,
        school_id,
    )

    out = dict(school)
    out["visits"] = [dict(v) for v in visits]
    out["recommendations"] = [dict(r) for r in recommendations]
    out["staff"] = [dict(s) for s in staff]
    return out


@router.patch("/schools/{school_id}")
async def update_school(
    school_id: UUID,
    body: SchoolUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _school_or_404(conn, school_id)
    fields = _normalize_strings(body.model_dump(exclude_unset=True))
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    values = list(fields.values())
    row = await conn.fetchrow(
        f"UPDATE schools SET {set_sql} WHERE id = $1 RETURNING *",
        school_id,
        *values,
    )
    return dict(row)


@router.delete("/schools/{school_id}", status_code=204)
async def delete_school(
    school_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete (sets deleted_at). Visits/recommendations reference
    schools via ON DELETE RESTRICT, so the row stays intact — the
    deleted_at filter just hides it from listings."""
    await _school_or_404(conn, school_id)
    await conn.execute(
        "UPDATE schools SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        school_id,
    )
    return None
