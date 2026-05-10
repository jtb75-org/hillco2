from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["learning_profiles"])


# ---- I/O models ------------------------------------------------------------

class ProfileCreate(BaseModel):
    # student_id is no longer accepted: the engagement uniquely determines
    # the student under the new spine. Kept off the request to make the
    # model match the DB invariant.
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
    row = await conn.fetchrow(
        "SELECT student_id FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return row


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
        SELECT lp.id, lp.engagement_id,
               lp.strengths, lp.challenges,
               lp.accommodations_needed, lp.services_needed,
               lp.summary, lp.finalized_at,
               lp.created_by, lp.created_at, lp.updated_at,
               e.student_id,
               TRIM(BOTH ' ' FROM
                 COALESCE(s.first_name, '') ||
                 CASE WHEN s.last_name IS NOT NULL AND s.last_name <> ''
                      THEN ' ' || s.last_name ELSE '' END
               )                                AS student_name,
               sd.current_grade,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS created_by_name
        FROM learning_profiles lp
        JOIN engagements e ON e.id = lp.engagement_id
        JOIN people s ON s.id = e.student_id AND s.kind = 'student'
        LEFT JOIN student_details sd ON sd.person_id = s.id
        LEFT JOIN people u ON u.id = lp.created_by
        WHERE lp.engagement_id = $1
        ORDER BY lp.created_at DESC
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
    """One learning profile per engagement (UNIQUE(engagement_id) at the
    DB level). The student is implied by the engagement, so the request
    body doesn't carry student_id."""
    await _engagement_or_404(conn, engagement_id)
    if await conn.fetchval(
        "SELECT 1 FROM learning_profiles WHERE engagement_id = $1",
        engagement_id,
    ):
        raise HTTPException(
            status_code=409,
            detail="A learning profile already exists for this engagement",
        )

    fields = _normalize(body.model_dump())
    row = await conn.fetchrow(
        """
        INSERT INTO learning_profiles (
          engagement_id, strengths, challenges,
          accommodations_needed, services_needed, summary, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        """,
        engagement_id,
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
