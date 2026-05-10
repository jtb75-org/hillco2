from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["school_visits"])


# ---- I/O models ------------------------------------------------------------

class VisitCreate(BaseModel):
    school_id: UUID
    visit_date: date | None = None  # defaults to today
    attendees: str | None = None  # free-text "who came" line; structured
                                  # contacts go in attendee_ids
    facts_notes: str | None = None
    opinion_notes: str | None = None
    hours: Decimal | None = Field(default=None, ge=0)
    scorecard: dict[str, Any] | None = None
    attendee_ids: list[UUID] = Field(default_factory=list)


class VisitUpdate(BaseModel):
    visit_date: date | None = None
    attendees: str | None = None
    facts_notes: str | None = None
    opinion_notes: str | None = None
    hours: Decimal | None = Field(default=None, ge=0)
    scorecard: dict[str, Any] | None = None


# ---- Helpers ---------------------------------------------------------------

async def _engagement_or_404(conn, engagement_id: UUID):
    if not await conn.fetchval(
        "SELECT 1 FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    ):
        raise HTTPException(status_code=404, detail="Engagement not found")


async def _visit_or_404(conn, visit_id: UUID):
    row = await conn.fetchrow("SELECT * FROM school_visits WHERE id = $1", visit_id)
    if not row:
        raise HTTPException(status_code=404, detail="Visit not found")
    return row


async def _attendees_for_visits(conn, visit_ids: list[UUID]) -> dict[UUID, list[dict]]:
    if not visit_ids:
        return {}
    rows = await conn.fetch(
        """
        SELECT a.school_visit_id, c.id, c.name, c.role, c.email
        FROM school_visit_attendees a
        JOIN contacts c ON c.id = a.contact_id
        WHERE a.school_visit_id = ANY($1::uuid[])
        ORDER BY c.name
        """,
        visit_ids,
    )
    by_visit: dict[UUID, list[dict]] = {}
    for r in rows:
        d = dict(r)
        vid = d.pop("school_visit_id")
        by_visit.setdefault(vid, []).append(d)
    return by_visit


# ---- Routes ----------------------------------------------------------------

@router.get("/engagements/{engagement_id}/visits")
async def list_visits(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    visits = await conn.fetch(
        """
        SELECT v.id, v.engagement_id, v.school_id, v.visit_date,
               v.attendees, v.facts_notes, v.opinion_notes, v.hours,
               v.scorecard, v.created_by, v.created_at, v.updated_at,
               s.name AS school_name, s.location AS school_location
        FROM school_visits v
        JOIN schools s ON s.id = v.school_id
        WHERE v.engagement_id = $1
        ORDER BY v.visit_date DESC, v.id DESC
        """,
        engagement_id,
    )
    by_visit = await _attendees_for_visits(conn, [v["id"] for v in visits])
    out = []
    for v in visits:
        d = dict(v)
        d["attendee_contacts"] = by_visit.get(v["id"], [])
        out.append(d)
    return out


@router.post("/engagements/{engagement_id}/visits", status_code=201)
async def add_visit(
    engagement_id: UUID,
    body: VisitCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    if not await conn.fetchval(
        "SELECT 1 FROM schools WHERE id = $1 AND deleted_at IS NULL",
        body.school_id,
    ):
        raise HTTPException(status_code=400, detail="school_id does not match an active school")

    visit_date = body.visit_date or date.today()
    attendees_text = (body.attendees or "").strip() or None
    facts = (body.facts_notes or "").strip() or None
    opinion = (body.opinion_notes or "").strip() or None

    # Drop any inactive contact ids before inserting attendees.
    valid_attendee_ids: list[UUID] = []
    if body.attendee_ids:
        active = await conn.fetch(
            "SELECT id FROM contacts WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL",
            body.attendee_ids,
        )
        valid_attendee_ids = [r["id"] for r in active]

    visit_id = await conn.fetchval(
        """
        INSERT INTO school_visits
          (engagement_id, school_id, visit_date, attendees,
           facts_notes, opinion_notes, hours, scorecard, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
        """,
        engagement_id, body.school_id, visit_date, attendees_text,
        facts, opinion, body.hours, body.scorecard, user["id"],
    )
    for cid in valid_attendee_ids:
        await conn.execute(
            """
            INSERT INTO school_visit_attendees (school_visit_id, contact_id)
            VALUES ($1, $2) ON CONFLICT DO NOTHING
            """,
            visit_id, cid,
        )

    row = await conn.fetchrow(
        """
        SELECT v.id, v.engagement_id, v.school_id, v.visit_date,
               v.attendees, v.facts_notes, v.opinion_notes, v.hours,
               v.scorecard, v.created_by, v.created_at, v.updated_at,
               s.name AS school_name, s.location AS school_location
        FROM school_visits v
        JOIN schools s ON s.id = v.school_id
        WHERE v.id = $1
        """,
        visit_id,
    )
    by_visit = await _attendees_for_visits(conn, [visit_id])
    out = dict(row)
    out["attendee_contacts"] = by_visit.get(visit_id, [])
    return out


@router.patch("/visits/{visit_id}")
async def update_visit(
    visit_id: UUID,
    body: VisitUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _visit_or_404(conn, visit_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    for col in ("attendees", "facts_notes", "opinion_notes"):
        if col in fields and fields[col] is not None:
            fields[col] = (fields[col] or "").strip() or None

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    row = await conn.fetchrow(
        f"""
        UPDATE school_visits SET {set_sql} WHERE id = $1
        RETURNING id, engagement_id, school_id, visit_date,
                  attendees, facts_notes, opinion_notes, hours,
                  scorecard, created_by, created_at, updated_at
        """,
        visit_id,
        *fields.values(),
    )
    return dict(row)


@router.post("/visits/{visit_id}/attendees/{contact_id}", status_code=201)
async def add_attendee(
    visit_id: UUID,
    contact_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _visit_or_404(conn, visit_id)
    if not await conn.fetchval(
        "SELECT 1 FROM contacts WHERE id = $1 AND deleted_at IS NULL",
        contact_id,
    ):
        raise HTTPException(status_code=400, detail="contact_id does not match an active contact")
    await conn.execute(
        """
        INSERT INTO school_visit_attendees (school_visit_id, contact_id)
        VALUES ($1, $2) ON CONFLICT DO NOTHING
        """,
        visit_id, contact_id,
    )
    return {"school_visit_id": str(visit_id), "contact_id": str(contact_id)}


@router.delete("/visits/{visit_id}/attendees/{contact_id}", status_code=204)
async def remove_attendee(
    visit_id: UUID,
    contact_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _visit_or_404(conn, visit_id)
    await conn.execute(
        "DELETE FROM school_visit_attendees WHERE school_visit_id = $1 AND contact_id = $2",
        visit_id, contact_id,
    )
    return None


@router.delete("/visits/{visit_id}", status_code=204)
async def delete_visit(
    visit_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Hard delete; the school_visit_attendees rows cascade away via
    ON DELETE CASCADE on that join table."""
    await _visit_or_404(conn, visit_id)
    await conn.execute("DELETE FROM school_visits WHERE id = $1", visit_id)
    return None
