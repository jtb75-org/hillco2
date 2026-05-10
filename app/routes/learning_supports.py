"""Learning supports: 504 plans and IEPs.

Per-student, school-issued records. Distinct from `learning_profiles`
(internal clinical workspace per engagement) and `agreements`
(engagement-scoped legal artifacts the parents sign).

The polymorphic `documents` table holds the attached PDF
(documents.owner_type='learning_support', owner_id=this row's id).
The route layer enforces ownership consistency since the FK can't.
"""
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["learning_supports"])


# 'plan_504' rather than '504_plan' because Postgres enum literals can't
# start with a digit. The SPA renders this as "504 plan" via a label map.
LearningSupportType = Literal["plan_504", "iep"]
LearningSupportStatus = Literal["active", "expired", "terminated"]


# ---- I/O models -----------------------------------------------------------

class LearningSupportCreate(BaseModel):
    type: LearningSupportType
    school_id: UUID | None = None
    effective_date: date | None = None
    review_date: date | None = None
    expires_at: date | None = None
    document_id: UUID | None = None
    notes: str | None = None


class LearningSupportUpdate(BaseModel):
    school_id: UUID | None = None
    status: LearningSupportStatus | None = None
    effective_date: date | None = None
    review_date: date | None = None
    expires_at: date | None = None
    document_id: UUID | None = None
    notes: str | None = None


# ---- Helpers --------------------------------------------------------------

async def _student_or_404(conn, student_id: UUID) -> None:
    if not await conn.fetchval(
        "SELECT 1 FROM students WHERE id = $1 AND deleted_at IS NULL",
        student_id,
    ):
        raise HTTPException(status_code=404, detail="Student not found")


async def _support_or_404(conn, support_id: UUID):
    row = await conn.fetchrow("SELECT * FROM learning_supports WHERE id = $1", support_id)
    if not row:
        raise HTTPException(status_code=404, detail="Learning support not found")
    return row


async def _validate_school_id(conn, school_id: UUID | None) -> None:
    if school_id is None:
        return
    if not await conn.fetchval(
        "SELECT 1 FROM schools WHERE id = $1 AND deleted_at IS NULL",
        school_id,
    ):
        raise HTTPException(status_code=400, detail="school_id not found.")


async def _validate_document_for_support(
    conn, document_id: UUID | None, *, support_id: UUID | None = None,
) -> None:
    """Ownership consistency for the polymorphic documents table.
    Same pattern as agreements._validate_document_for_agreement; a
    document already attached to a different support, or to a student
    other than this row's, is a misattachment."""
    if document_id is None:
        return
    row = await conn.fetchrow(
        "SELECT owner_type, owner_id FROM documents WHERE id = $1 AND deleted_at IS NULL",
        document_id,
    )
    if row is None:
        raise HTTPException(status_code=400, detail="document_id not found.")
    if row["owner_type"] == "learning_support" and (
        support_id is None or row["owner_id"] == support_id
    ):
        return
    raise HTTPException(
        status_code=400,
        detail=f"document_id is owned by {row['owner_type']}; cannot attach to a learning support.",
    )


# ---- Routes ---------------------------------------------------------------

@router.get("/students/{student_id}/learning-supports")
async def list_for_student(
    student_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _student_or_404(conn, student_id)
    rows = await conn.fetch(
        """
        SELECT ls.*, sch.name AS school_name, u.name AS created_by_name
        FROM learning_supports ls
        LEFT JOIN schools sch ON sch.id = ls.school_id
        LEFT JOIN users   u   ON u.id   = ls.created_by
        WHERE ls.student_id = $1
        ORDER BY ls.created_at DESC, ls.id DESC
        """,
        student_id,
    )
    return [dict(r) for r in rows]


@router.post("/students/{student_id}/learning-supports", status_code=201)
async def create_support(
    student_id: UUID,
    body: LearningSupportCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Creates an active record. Existing active records of the same
    type for the same student would conflict with the partial UNIQUE
    index — the route doesn't auto-expire the old one; that's a
    deliberate two-step (PATCH old to status='expired', then POST new)
    so the operator pauses to think about the transition."""
    await _student_or_404(conn, student_id)
    await _validate_school_id(conn, body.school_id)
    await _validate_document_for_support(conn, body.document_id)

    try:
        row = await conn.fetchrow(
            """
            INSERT INTO learning_supports (
              student_id, type, school_id,
              effective_date, review_date, expires_at,
              document_id, notes, created_by
            ) VALUES ($1, $2::learning_support_type, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            """,
            student_id, body.type, body.school_id,
            body.effective_date, body.review_date, body.expires_at,
            body.document_id, (body.notes or "").strip() or None, user["id"],
        )
    except Exception as e:  # asyncpg.UniqueViolationError caught generically
        if "learning_supports_one_active_per_type" in str(e):
            raise HTTPException(
                status_code=409,
                detail=(
                    "An active record of this type already exists for this student. "
                    "Expire the existing record before creating a new one."
                ),
            ) from e
        raise
    return dict(row)


@router.get("/learning-supports/{support_id}")
async def support_detail(
    support_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    row = await conn.fetchrow(
        """
        SELECT ls.*, sch.name AS school_name, u.name AS created_by_name
        FROM learning_supports ls
        LEFT JOIN schools sch ON sch.id = ls.school_id
        LEFT JOIN users   u   ON u.id   = ls.created_by
        WHERE ls.id = $1
        """,
        support_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Learning support not found")
    return dict(row)


@router.patch("/learning-supports/{support_id}")
async def update_support(
    support_id: UUID,
    body: LearningSupportUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _support_or_404(conn, support_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "school_id" in fields:
        await _validate_school_id(conn, fields["school_id"])
    if "document_id" in fields:
        await _validate_document_for_support(
            conn, fields["document_id"], support_id=support_id,
        )
    if "notes" in fields:
        fields["notes"] = (fields["notes"] or "").strip() or None

    sets = []
    values = []
    for col, val in fields.items():
        if col == "status":
            sets.append(f"status = ${len(values)+2}::learning_support_status")
        else:
            sets.append(f"{col} = ${len(values)+2}")
        values.append(val)
    set_sql = ", ".join(sets)
    row = await conn.fetchrow(
        f"UPDATE learning_supports SET {set_sql} WHERE id = $1 RETURNING *",
        support_id,
        *values,
    )
    return dict(row)


@router.delete("/learning-supports/{support_id}", status_code=204)
async def delete_support(
    support_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Hard delete. Unlike agreements, learning supports have no
    supersession chain to corrupt and no financial weight; deletion is
    the right verb for "this was added in error." Use status='expired'
    or 'terminated' to retain history."""
    await _support_or_404(conn, support_id)
    await conn.execute("DELETE FROM learning_supports WHERE id = $1", support_id)
    return None
