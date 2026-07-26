from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["followups"])

FollowupStatus = Literal["open", "done", "cancelled"]


# ---- I/O models ------------------------------------------------------------

class FollowupCreate(BaseModel):
    title: str = Field(..., min_length=1)
    due_date: date
    body: str | None = None
    assignee_id: UUID | None = None  # defaults to the requester


class FollowupUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    body: str | None = None
    due_date: date | None = None
    assignee_id: UUID | None = None


class FollowupStatusUpdate(BaseModel):
    status: FollowupStatus


# ---- Helpers ---------------------------------------------------------------

async def _engagement_or_404(conn, engagement_id: UUID):
    if not await conn.fetchval(
        "SELECT 1 FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    ):
        raise HTTPException(status_code=404, detail="Engagement not found")


async def _followup_or_404(conn, followup_id: UUID):
    row = await conn.fetchrow("SELECT * FROM followups WHERE id = $1", followup_id)
    if not row:
        raise HTTPException(status_code=404, detail="Followup not found")
    return row


async def _resolve_assignee(conn, supplied: UUID | None, fallback: UUID) -> UUID:
    """Validate assignee is an active user. Falls back to the caller's id
    if the supplied id isn't active — same defensive behavior as
    hillco-portal."""
    if supplied is None or supplied == fallback:
        return fallback
    if await conn.fetchval(
        "SELECT 1 FROM auth WHERE person_id = $1 AND status = 'active'",
        supplied,
    ):
        return supplied
    return fallback


# ---- Routes ----------------------------------------------------------------

@router.get("/engagements/{engagement_id}/followups")
async def list_followups(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    rows = await conn.fetch(
        """
        SELECT f.id, f.engagement_id, f.title, f.body, f.due_date, f.status,
               f.completed_at, f.assignee_id, f.created_by,
               f.created_at, f.updated_at,
               TRIM(BOTH ' ' FROM COALESCE(assignee.first_name,'') || CASE WHEN assignee.last_name IS NOT NULL AND assignee.last_name <> '' THEN ' ' || assignee.last_name ELSE '' END) AS assignee_name,
               TRIM(BOTH ' ' FROM COALESCE(creator.first_name,'') || CASE WHEN creator.last_name IS NOT NULL AND creator.last_name <> '' THEN ' ' || creator.last_name ELSE '' END) AS created_by_name
        FROM followups f
        LEFT JOIN people assignee ON assignee.id = f.assignee_id
        LEFT JOIN people creator  ON creator.id  = f.created_by
        WHERE f.engagement_id = $1
        ORDER BY
          CASE f.status
            WHEN 'open' THEN 0
            WHEN 'done' THEN 1
            WHEN 'cancelled' THEN 2
          END,
          f.due_date ASC,
          f.id DESC
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


@router.get("/followups")
async def list_all_followups(
    status: Literal["open", "done", "cancelled", "all"] = "open",
    assignee: Literal["me", "all"] = "me",
    overdue: bool = False,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Cross-engagement followups list for the /followups page. Defaults
    mirror the dashboard's My Followups card (my open items);
    overdue=true narrows to open items past their due date — the same
    definition the dashboard's overdue count uses."""
    assignee_id = user["id"] if assignee == "me" else None
    rows = await conn.fetch(
        """
        SELECT f.id, f.engagement_id, f.title, f.body, f.due_date, f.status,
               f.completed_at, f.assignee_id,
               TRIM(BOTH ' ' FROM COALESCE(assignee.first_name,'') || CASE WHEN assignee.last_name IS NOT NULL AND assignee.last_name <> '' THEN ' ' || assignee.last_name ELSE '' END) AS assignee_name,
               e.family_id, fam.household_name
        FROM followups f
        JOIN engagements e ON e.id = f.engagement_id AND e.deleted_at IS NULL
        JOIN families fam ON fam.id = e.family_id
        LEFT JOIN people assignee ON assignee.id = f.assignee_id
        WHERE ($1 = 'all' OR f.status::text = $1)
          AND ($2::uuid IS NULL OR f.assignee_id = $2)
          AND (NOT $3::bool OR (f.status = 'open' AND f.due_date < CURRENT_DATE))
        ORDER BY
          CASE f.status
            WHEN 'open' THEN 0
            WHEN 'done' THEN 1
            WHEN 'cancelled' THEN 2
          END,
          f.due_date ASC,
          f.id DESC
        """,
        status, assignee_id, overdue,
    )
    return [dict(r) for r in rows]


@router.post("/engagements/{engagement_id}/followups", status_code=201)
async def add_followup(
    engagement_id: UUID,
    body: FollowupCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    assignee_id = await _resolve_assignee(conn, body.assignee_id, user["id"])
    title = body.title.strip()
    body_txt = (body.body or "").strip() or None

    row = await conn.fetchrow(
        """
        INSERT INTO followups (
          engagement_id, title, body, due_date, assignee_id, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, 'open', $6)
        RETURNING id, engagement_id, title, body, due_date, status, completed_at,
                  assignee_id, created_by, created_at, updated_at
        """,
        engagement_id, title, body_txt, body.due_date, assignee_id, user["id"],
    )
    return dict(row)


@router.patch("/followups/{followup_id}")
async def update_followup(
    followup_id: UUID,
    body: FollowupUpdate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _followup_or_404(conn, followup_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "title" in fields:
        fields["title"] = fields["title"].strip()
    if "body" in fields:
        fields["body"] = (fields["body"] or "").strip() or None
    if "assignee_id" in fields and fields["assignee_id"] is not None:
        fields["assignee_id"] = await _resolve_assignee(
            conn, fields["assignee_id"], user["id"]
        )

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    row = await conn.fetchrow(
        f"""
        UPDATE followups SET {set_sql} WHERE id = $1
        RETURNING id, engagement_id, title, body, due_date, status, completed_at,
                  assignee_id, created_by, created_at, updated_at
        """,
        followup_id,
        *fields.values(),
    )
    return dict(row)


@router.post("/followups/{followup_id}/status")
async def update_followup_status(
    followup_id: UUID,
    body: FollowupStatusUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Dedicated status transition endpoint — completed_at is auto-stamped
    on the 'done' transition and cleared on any other transition."""
    await _followup_or_404(conn, followup_id)
    row = await conn.fetchrow(
        """
        UPDATE followups
        SET status = $1::followup_status,
            completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END
        WHERE id = $2
        RETURNING id, engagement_id, title, body, due_date, status, completed_at,
                  assignee_id, created_by, created_at, updated_at
        """,
        body.status, followup_id,
    )
    return dict(row)


@router.delete("/followups/{followup_id}", status_code=204)
async def delete_followup(
    followup_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _followup_or_404(conn, followup_id)
    await conn.execute("DELETE FROM followups WHERE id = $1", followup_id)
    return None
