from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["recommendations"])

RecStatus = Literal[
    "considered", "recommended", "applied", "accepted", "enrolled", "rejected"
]


# ---- I/O models ------------------------------------------------------------

class RecommendationCreate(BaseModel):
    school_id: UUID
    status: RecStatus = "considered"
    rank: int | None = None
    notes: str | None = None


class RecommendationUpdate(BaseModel):
    status: RecStatus | None = None
    rank: int | None = None
    notes: str | None = None


class RecStatusUpdate(BaseModel):
    status: RecStatus


# ---- Helpers ---------------------------------------------------------------

async def _engagement_or_404(conn, engagement_id: UUID):
    if not await conn.fetchval(
        "SELECT 1 FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    ):
        raise HTTPException(status_code=404, detail="Engagement not found")


async def _rec_or_404(conn, rec_id: UUID):
    row = await conn.fetchrow(
        "SELECT * FROM school_recommendations WHERE id = $1",
        rec_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return row


# ---- Routes ----------------------------------------------------------------

@router.get("/engagements/{engagement_id}/recommendations")
async def list_recommendations(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    rows = await conn.fetch(
        """
        SELECT r.id, r.engagement_id, r.school_id, r.rank, r.status, r.notes,
               r.created_at, r.updated_at,
               s.name AS school_name, s.location AS school_location
        FROM school_recommendations r
        JOIN schools s ON s.id = r.school_id
        WHERE r.engagement_id = $1
        ORDER BY
          CASE r.status
            WHEN 'enrolled'    THEN 0
            WHEN 'accepted'    THEN 1
            WHEN 'applied'     THEN 2
            WHEN 'recommended' THEN 3
            WHEN 'considered'  THEN 4
            WHEN 'rejected'    THEN 5
          END,
          r.rank ASC NULLS LAST,
          r.id
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


@router.post("/engagements/{engagement_id}/recommendations", status_code=201)
async def add_recommendation(
    engagement_id: UUID,
    body: RecommendationCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Idempotent upsert keyed by (engagement_id, school_id) — repeated
    POSTs with the same school don't create duplicates, they update.
    Mirrors hillco-portal's ON CONFLICT shape."""
    await _engagement_or_404(conn, engagement_id)
    if not await conn.fetchval(
        "SELECT 1 FROM schools WHERE id = $1 AND deleted_at IS NULL",
        body.school_id,
    ):
        raise HTTPException(status_code=400, detail="school_id does not match an active school")
    notes = (body.notes or "").strip() or None

    row = await conn.fetchrow(
        """
        INSERT INTO school_recommendations
          (engagement_id, school_id, rank, status, notes)
        VALUES ($1, $2, $3, $4::school_recommendation_status, $5)
        ON CONFLICT (engagement_id, school_id) DO UPDATE SET
          rank = EXCLUDED.rank,
          status = EXCLUDED.status,
          notes = COALESCE(EXCLUDED.notes, school_recommendations.notes)
        RETURNING id, engagement_id, school_id, rank, status, notes,
                  created_at, updated_at
        """,
        engagement_id, body.school_id, body.rank, body.status, notes,
    )
    return dict(row)


@router.patch("/recommendations/{rec_id}")
async def update_recommendation(
    rec_id: UUID,
    body: RecommendationUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _rec_or_404(conn, rec_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "notes" in fields:
        fields["notes"] = (fields["notes"] or "").strip() or None

    set_sql_parts = []
    values = []
    for col, val in fields.items():
        values.append(val)
        if col == "status":
            set_sql_parts.append(f"status = ${len(values)+1}::school_recommendation_status")
        else:
            set_sql_parts.append(f"{col} = ${len(values)+1}")
    set_sql = ", ".join(set_sql_parts)
    row = await conn.fetchrow(
        f"""
        UPDATE school_recommendations SET {set_sql} WHERE id = $1
        RETURNING id, engagement_id, school_id, rank, status, notes,
                  created_at, updated_at
        """,
        rec_id,
        *values,
    )
    return dict(row)


@router.post("/recommendations/{rec_id}/status")
async def update_rec_status(
    rec_id: UUID,
    body: RecStatusUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _rec_or_404(conn, rec_id)
    row = await conn.fetchrow(
        """
        UPDATE school_recommendations
        SET status = $1::school_recommendation_status
        WHERE id = $2
        RETURNING id, engagement_id, school_id, rank, status, notes,
                  created_at, updated_at
        """,
        body.status, rec_id,
    )
    return dict(row)


@router.delete("/recommendations/{rec_id}", status_code=204)
async def delete_recommendation(
    rec_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _rec_or_404(conn, rec_id)
    await conn.execute("DELETE FROM school_recommendations WHERE id = $1", rec_id)
    return None
