from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["learning_profiles"])


# ---- I/O models ------------------------------------------------------------

class ProfileCreate(BaseModel):
    student_id: UUID
    strengths: str | None = None
    challenges: str | None = None
    accommodations_needed: str | None = None
    services_needed: str | None = None
    summary: str | None = None


class ProfileUpdate(BaseModel):
    strengths: str | None = None
    challenges: str | None = None
    accommodations_needed: str | None = None
    services_needed: str | None = None
    summary: str | None = None


# ---- Helpers ---------------------------------------------------------------

async def _engagement_or_404(conn, engagement_id: UUID):
    if not await conn.fetchval(
        "SELECT 1 FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    ):
        raise HTTPException(status_code=404, detail="Engagement not found")


async def _student_in_engagement(conn, engagement_id: UUID, student_id: UUID) -> bool:
    return bool(
        await conn.fetchval(
            """
            SELECT 1
            FROM engagement_students es
            JOIN students s ON s.id = es.student_id AND s.deleted_at IS NULL
            WHERE es.engagement_id = $1 AND es.student_id = $2
            """,
            engagement_id, student_id,
        )
    )


async def _profile_or_404(conn, profile_id: UUID):
    row = await conn.fetchrow("SELECT * FROM learning_profiles WHERE id = $1", profile_id)
    if not row:
        raise HTTPException(status_code=404, detail="Learning profile not found")
    return row


def _normalize(fields: dict) -> dict:
    for col in ("strengths", "challenges", "accommodations_needed", "services_needed", "summary"):
        if col in fields and fields[col] is not None:
            fields[col] = (fields[col] or "").strip() or None
    return fields


# ---- Routes ----------------------------------------------------------------

@router.get("/engagements/{engagement_id}/learning-profiles")
async def list_profiles(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    rows = await conn.fetch(
        """
        SELECT lp.id, lp.engagement_id, lp.student_id,
               lp.strengths, lp.challenges,
               lp.accommodations_needed, lp.services_needed,
               lp.summary, lp.finalized_at,
               lp.created_by, lp.created_at, lp.updated_at,
               s.name AS student_name, s.current_grade,
               u.name AS created_by_name
        FROM learning_profiles lp
        JOIN students s ON s.id = lp.student_id
        LEFT JOIN users u ON u.id = lp.created_by
        WHERE lp.engagement_id = $1
        ORDER BY s.name
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


@router.post("/engagements/{engagement_id}/learning-profiles", status_code=201)
async def add_profile(
    engagement_id: UUID,
    body: ProfileCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Creates a learning profile for the given (engagement, student). The
    UNIQUE (engagement_id, student_id) constraint means there's only one
    profile per pair — re-creating raises 409."""
    await _engagement_or_404(conn, engagement_id)
    if not await _student_in_engagement(conn, engagement_id, body.student_id):
        raise HTTPException(
            status_code=400,
            detail="student_id is not on this engagement (check engagement_students)",
        )
    if await conn.fetchval(
        """
        SELECT 1 FROM learning_profiles
        WHERE engagement_id = $1 AND student_id = $2
        """,
        engagement_id, body.student_id,
    ):
        raise HTTPException(
            status_code=409,
            detail="A learning profile already exists for this student in this engagement",
        )

    fields = _normalize(body.model_dump(exclude={"student_id"}))
    row = await conn.fetchrow(
        """
        INSERT INTO learning_profiles (
          engagement_id, student_id, strengths, challenges,
          accommodations_needed, services_needed, summary, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        """,
        engagement_id, body.student_id,
        fields["strengths"], fields["challenges"],
        fields["accommodations_needed"], fields["services_needed"],
        fields["summary"], user["id"],
    )
    return dict(row)


@router.patch("/learning-profiles/{profile_id}")
async def update_profile(
    profile_id: UUID,
    body: ProfileUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _profile_or_404(conn, profile_id)
    fields = _normalize(body.model_dump(exclude_unset=True))
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    row = await conn.fetchrow(
        f"UPDATE learning_profiles SET {set_sql} WHERE id = $1 RETURNING *",
        profile_id,
        *fields.values(),
    )
    return dict(row)


@router.post("/learning-profiles/{profile_id}/finalize")
async def finalize_profile(
    profile_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Stamp finalized_at = NOW(). Idempotent — subsequent calls just
    refresh the timestamp."""
    await _profile_or_404(conn, profile_id)
    row = await conn.fetchrow(
        """
        UPDATE learning_profiles SET finalized_at = NOW()
        WHERE id = $1
        RETURNING *
        """,
        profile_id,
    )
    return dict(row)


@router.post("/learning-profiles/{profile_id}/unfinalize")
async def unfinalize_profile(
    profile_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Clears finalized_at. Useful when reopening a profile for revisions
    after the family meeting."""
    await _profile_or_404(conn, profile_id)
    row = await conn.fetchrow(
        """
        UPDATE learning_profiles SET finalized_at = NULL
        WHERE id = $1
        RETURNING *
        """,
        profile_id,
    )
    return dict(row)


@router.delete("/learning-profiles/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _profile_or_404(conn, profile_id)
    await conn.execute("DELETE FROM learning_profiles WHERE id = $1", profile_id)
    return None
