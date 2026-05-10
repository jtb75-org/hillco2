from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["students"])

# Boolean diagnostic columns. `autism` is intentionally NOT here —
# hillco2 replaced has_autism BOOLEAN with autism_level SMALLINT (1..3, NULL).
DIAGNOSTIC_BOOL_COLS = (
    "has_504",
    "has_iep",
    "has_learning_disability",
    "has_adhd",
    "has_intellectual_disability",
    "has_health_impairment",
    "has_emotional_disturbance",
)


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
    name: str = Field(..., min_length=1)


class StudentUpdate(StudentBase):
    pass


# ---- Helpers ---------------------------------------------------------------

async def _student_or_404(conn, student_id: UUID):
    row = await conn.fetchrow(
        """
        SELECT s.*, f.household_name AS family_household_name
        FROM students s
        JOIN families f ON f.id = s.family_id AND f.deleted_at IS NULL
        WHERE s.id = $1 AND s.deleted_at IS NULL
        """,
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
    for col in ("current_grade", "diagnosis_other", "needs_goals"):
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

    fields = _normalize_strings(body.model_dump(exclude_unset=False))
    # Defaults for missing booleans -> False; autism_level missing -> NULL.
    for col in DIAGNOSTIC_BOOL_COLS:
        if fields.get(col) is None:
            fields[col] = False

    row = await conn.fetchrow(
        """
        INSERT INTO students (
          family_id, name, dob, current_school_id, current_grade,
          autism_level,
          has_504, has_iep, has_learning_disability, has_adhd,
          has_intellectual_disability, has_health_impairment,
          has_emotional_disturbance,
          diagnosis_other, needs_goals
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6,
          $7, $8, $9, $10, $11, $12, $13,
          $14, $15
        )
        RETURNING *
        """,
        family_id,
        fields["name"],
        fields["dob"],
        fields["current_school_id"],
        fields["current_grade"],
        fields["autism_level"],
        fields["has_504"], fields["has_iep"], fields["has_learning_disability"],
        fields["has_adhd"], fields["has_intellectual_disability"],
        fields["has_health_impairment"], fields["has_emotional_disturbance"],
        fields["diagnosis_other"], fields["needs_goals"],
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
               u.id AS lead_consultant_id, u.name AS lead_consultant_name
        FROM engagement_students es
        JOIN engagements e ON e.id = es.engagement_id AND e.deleted_at IS NULL
        LEFT JOIN users u ON u.id = e.lead_consultant_id
        WHERE es.student_id = $1
        ORDER BY e.start_date DESC NULLS LAST, e.id DESC
        """,
        student_id,
    )

    # Recent notes from any engagement that covers this student.
    notes = await conn.fetch(
        """
        SELECT n.id, n.kind, n.occurred_on, n.title, n.body, n.created_at,
               n.engagement_id,
               u.name AS created_by_name
        FROM notes n
        JOIN engagements e ON e.id = n.engagement_id AND e.deleted_at IS NULL
        JOIN engagement_students es ON es.engagement_id = e.id
        LEFT JOIN users u ON u.id = n.created_by
        WHERE es.student_id = $1
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
            raise HTTPException(status_code=400, detail="current_school_id does not match an active school")

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    values = list(fields.values())
    row = await conn.fetchrow(
        f"UPDATE students SET {set_sql} WHERE id = $1 RETURNING *",
        student_id,
        *values,
    )
    return dict(row)


@router.delete("/students/{student_id}", status_code=204)
async def delete_student(
    student_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete (sets deleted_at)."""
    await _student_or_404(conn, student_id)
    await conn.execute(
        "UPDATE students SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        student_id,
    )
    return None
