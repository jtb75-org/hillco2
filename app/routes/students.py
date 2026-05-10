"""Student routes — read/write through the new people spine.

Migration 0008 split the legacy `students` table into three:
  * `people` (kind='student'): name, birthday, address, soft-delete state
  * `family_students` (junction): which family a student belongs to
  * `student_details` (1:1 with people): clinical fields (grade, school,
    has_504, has_iep, autism_level, etc.)

This module's routes preserve the legacy single-row shape on the wire
so the SPA and existing tests keep working: composes `name` from
first_name + last_name, surfaces `dob` from people.birthday, and
flattens student_details columns into the response.

The legacy `students` table still exists in the schema but no route
reads or writes it after this PR; migration 0011 drops it.
"""
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["students"])

DIAGNOSTIC_BOOL_COLS = (
    "has_504",
    "has_iep",
    "has_learning_disability",
    "has_adhd",
    "has_intellectual_disability",
    "has_health_impairment",
    "has_emotional_disturbance",
)
DETAIL_TEXT_COLS = ("current_grade", "diagnosis_other", "needs_goals")


# ---- I/O models ------------------------------------------------------------

class StudentBase(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    dob: date | None = None
    current_school_id: UUID | None = None
    current_grade: str | None = None
    autism_level: int | None = Field(default=None, ge=1, le=3)
    has_504: bool | None = None
    has_iep: bool | None = None
    has_learning_disability: bool | None = None
    has_adhd: bool | None = None
    has_intellectual_disability: bool | None = None
    has_health_impairment: bool | None = None
    has_emotional_disturbance: bool | None = None
    diagnosis_other: str | None = None
    needs_goals: str | None = None


class StudentCreate(StudentBase):
    # When `person_id` is set, link the existing student to this family —
    # name/dob/clinical fields are ignored; the person's own record stays
    # the source of truth. When absent, a new `people` row is created.
    person_id: UUID | None = None

    @model_validator(mode="after")
    def _name_or_person_id(self):
        if self.person_id is None and not (self.name or "").strip():
            raise ValueError("Either person_id or name is required.")
        return self


class StudentUpdate(StudentBase):
    pass


# ---- Helpers ---------------------------------------------------------------

def _split_name(name: str) -> tuple[str, str | None]:
    """Single-token names land entirely in first_name; whitespace-only
    treated as empty first_name."""
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
      fs.family_id,
      TRIM(BOTH ' ' FROM
        COALESCE(p.first_name, '') ||
        CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
             THEN ' ' || p.last_name ELSE '' END
      )                                       AS name,
      p.birthday                              AS dob,
      sd.current_school_id, sd.current_grade,
      sd.autism_level,
      sd.has_504, sd.has_iep, sd.has_learning_disability,
      sd.has_adhd, sd.has_intellectual_disability,
      sd.has_health_impairment, sd.has_emotional_disturbance,
      sd.diagnosis_other, sd.needs_goals,
      p.deleted_at,
      p.created_at, p.updated_at,
      f.household_name AS family_household_name
    FROM people p
    JOIN family_students fs ON fs.person_id = p.id
    JOIN families f ON f.id = fs.family_id AND f.deleted_at IS NULL
    LEFT JOIN student_details sd ON sd.person_id = p.id
"""


async def _student_or_404(conn, student_id: UUID):
    row = await conn.fetchrow(
        _LEGACY_SHAPE_SELECT
        + " WHERE p.id = $1 AND p.deleted_at IS NULL AND p.kind = 'student'",
        student_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Student not found")
    return row


async def _family_exists(conn, family_id: UUID) -> bool:
    return bool(
        await conn.fetchval(
            "SELECT 1 FROM families WHERE id = $1 AND deleted_at IS NULL",
            family_id,
        )
    )


def _normalize_strings(fields: dict) -> dict:
    """Trim strings; turn empty strings into NULL for nullable text columns."""
    for col in DETAIL_TEXT_COLS:
        if col in fields and fields[col] is not None:
            stripped = fields[col].strip()
            fields[col] = stripped or None
    if "name" in fields and fields["name"] is not None:
        fields["name"] = fields["name"].strip()
    return fields


# ---- Routes ----------------------------------------------------------------

@router.post("/families/{family_id}/students", status_code=201)
async def add_student(
    family_id: UUID,
    body: StudentCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    if not await _family_exists(conn, family_id):
        raise HTTPException(status_code=404, detail="Family not found")

    if body.person_id is not None:
        # Link mode: only existing kind='student' records can be linked.
        target = await conn.fetchrow(
            "SELECT kind::text AS kind FROM people WHERE id = $1 AND deleted_at IS NULL",
            body.person_id,
        )
        if not target:
            raise HTTPException(status_code=404, detail="Person not found")
        if target["kind"] != "student":
            raise HTTPException(
                status_code=400,
                detail="Only existing student records can be linked here.",
            )
        already_linked = await conn.fetchval(
            "SELECT 1 FROM family_students WHERE family_id = $1 AND person_id = $2",
            family_id, body.person_id,
        )
        if already_linked:
            raise HTTPException(
                status_code=409,
                detail="This student is already linked to this family.",
            )
        await conn.execute(
            "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
            family_id, body.person_id,
        )
        row = await conn.fetchrow(
            _LEGACY_SHAPE_SELECT + " WHERE p.id = $1 AND fs.family_id = $2",
            body.person_id, family_id,
        )
        return dict(row)

    fields = _normalize_strings(body.model_dump(exclude_unset=False))
    # Default missing booleans -> False; autism_level missing -> NULL.
    for col in DIAGNOSTIC_BOOL_COLS:
        if fields.get(col) is None:
            fields[col] = False

    first, last = _split_name(fields["name"])
    person_id = await conn.fetchval(
        """
        INSERT INTO people (kind, first_name, last_name, birthday)
        VALUES ('student', $1, $2, $3)
        RETURNING id
        """,
        first, last, fields["dob"],
    )
    await conn.execute(
        "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
        family_id, person_id,
    )
    await conn.execute(
        """
        INSERT INTO student_details (
          person_id, current_school_id, current_grade,
          autism_level,
          has_504, has_iep, has_learning_disability,
          has_adhd, has_intellectual_disability,
          has_health_impairment, has_emotional_disturbance,
          diagnosis_other, needs_goals
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        """,
        person_id,
        fields["current_school_id"], fields["current_grade"],
        fields["autism_level"],
        fields["has_504"], fields["has_iep"], fields["has_learning_disability"],
        fields["has_adhd"], fields["has_intellectual_disability"],
        fields["has_health_impairment"], fields["has_emotional_disturbance"],
        fields["diagnosis_other"], fields["needs_goals"],
    )

    row = await conn.fetchrow(
        _LEGACY_SHAPE_SELECT + " WHERE p.id = $1",
        person_id,
    )
    return dict(row)


@router.get("/students/{student_id}")
async def student_detail(
    student_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    student = await _student_or_404(conn, student_id)

    school = None
    if student["current_school_id"]:
        school = await conn.fetchrow(
            "SELECT id, name FROM schools WHERE id = $1 AND deleted_at IS NULL",
            student["current_school_id"],
        )

    engagements = await conn.fetch(
        """
        SELECT e.id, e.engagement_type, e.status, e.start_date, e.target_end_date,
               u.id AS lead_consultant_id, TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS lead_consultant_name
        FROM engagements e
        LEFT JOIN people u ON u.id = e.lead_consultant_id
        WHERE e.student_id = $1 AND e.deleted_at IS NULL
        ORDER BY e.start_date DESC NULLS LAST, e.id DESC
        """,
        student_id,
    )

    notes = await conn.fetch(
        """
        SELECT n.id, n.kind, n.occurred_on, n.title, n.body, n.created_at,
               n.engagement_id,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS created_by_name
        FROM notes n
        JOIN engagements e ON e.id = n.engagement_id AND e.deleted_at IS NULL
        LEFT JOIN people u ON u.id = n.created_by
        WHERE e.student_id = $1
        ORDER BY n.occurred_on DESC, n.id DESC
        LIMIT 30
        """,
        student_id,
    )

    out = dict(student)
    out["family"] = {
        "id": student["family_id"],
        "household_name": student["family_household_name"],
    }
    out.pop("family_household_name", None)
    out["school"] = dict(school) if school else None
    out["engagements"] = [dict(e) for e in engagements]
    out["recent_notes"] = [dict(n) for n in notes]
    return out


@router.patch("/students/{student_id}")
async def update_student(
    student_id: UUID,
    body: StudentUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _student_or_404(conn, student_id)
    fields = _normalize_strings(body.model_dump(exclude_unset=True))
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "current_school_id" in fields and fields["current_school_id"] is not None:
        if not await conn.fetchval(
            "SELECT 1 FROM schools WHERE id = $1 AND deleted_at IS NULL",
            fields["current_school_id"],
        ):
            raise HTTPException(
                status_code=400,
                detail="current_school_id does not match an active school",
            )

    # Split the patch by destination table.
    people_updates: list[tuple[str, object]] = []
    if "name" in fields:
        first, last = _split_name(fields["name"])
        people_updates.append(("first_name", first))
        people_updates.append(("last_name", last))
    if "dob" in fields:
        people_updates.append(("birthday", fields["dob"]))

    detail_cols = ("current_school_id", "autism_level") + DIAGNOSTIC_BOOL_COLS + DETAIL_TEXT_COLS
    detail_updates: list[tuple[str, object]] = []
    for col in detail_cols:
        if col in fields:
            detail_updates.append((col, fields[col]))

    if people_updates:
        set_sql = ", ".join(f"{col} = ${i+2}" for i, (col, _) in enumerate(people_updates))
        await conn.execute(
            f"UPDATE people SET {set_sql} WHERE id = $1",
            student_id,
            *(v for _, v in people_updates),
        )

    if detail_updates:
        set_sql = ", ".join(f"{col} = ${i+2}" for i, (col, _) in enumerate(detail_updates))
        await conn.execute(
            f"UPDATE student_details SET {set_sql} WHERE person_id = $1",
            student_id,
            *(v for _, v in detail_updates),
        )

    row = await conn.fetchrow(
        _LEGACY_SHAPE_SELECT + " WHERE p.id = $1",
        student_id,
    )
    return dict(row)


@router.delete("/students/{student_id}", status_code=204)
async def delete_student(
    student_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete: sets people.deleted_at. The student disappears
    from listings and detail. family_students and student_details rows
    remain so audit_log entries and engagements still reference a real
    person; the engagements.student_id FK is ON DELETE RESTRICT, so
    a hard-delete with active engagements would fail anyway."""
    await _student_or_404(conn, student_id)
    await conn.execute(
        "UPDATE people SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        student_id,
    )
    return None
