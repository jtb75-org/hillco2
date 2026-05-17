from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["time_entries"])


# ---- I/O models ------------------------------------------------------------

class TimeEntryCreate(BaseModel):
    work_date: date | None = None  # defaults to today
    hours: Decimal = Field(..., gt=0)
    description: str | None = None
    billable: bool = True
    hourly_rate: Decimal | None = None
    user_id: UUID | None = None  # who did the work; defaults to the requester
    # Optional link to the engagement task this time was spent on. NULL
    # means freeform engagement-level time; set when logged from the
    # task's kebab menu.
    engagement_task_id: UUID | None = None


class TimeEntryUpdate(BaseModel):
    work_date: date | None = None
    hours: Decimal | None = Field(default=None, gt=0)
    description: str | None = None
    billable: bool | None = None
    hourly_rate: Decimal | None = None
    user_id: UUID | None = None
    engagement_task_id: UUID | None = None


# ---- Helpers ---------------------------------------------------------------

async def _engagement_or_404(conn, engagement_id: UUID):
    row = await conn.fetchrow(
        "SELECT id, default_hourly_rate FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return row


async def _time_entry_or_404(conn, entry_id: UUID):
    row = await conn.fetchrow("SELECT * FROM time_entries WHERE id = $1", entry_id)
    if not row:
        raise HTTPException(status_code=404, detail="Time entry not found")
    return row


async def _resolve_active_user(conn, supplied: UUID | None, fallback: UUID) -> UUID:
    if supplied is None or supplied == fallback:
        return fallback
    if await conn.fetchval(
        "SELECT 1 FROM auth WHERE person_id = $1 AND status = 'active'",
        supplied,
    ):
        return supplied
    return fallback


# ---- Routes ----------------------------------------------------------------

@router.get("/engagements/{engagement_id}/time-entries")
async def list_time_entries(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    rows = await conn.fetch(
        """
        SELECT t.id, t.engagement_id, t.user_id, t.work_date, t.hours,
               t.description, t.billable, t.hourly_rate,
               t.invoice_id, t.engagement_task_id,
               t.created_at, t.updated_at,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS user_name,
               i.invoice_number AS invoice_number,
               et.title AS task_title
        FROM time_entries t
        LEFT JOIN people u           ON u.id = t.user_id
        LEFT JOIN invoices i         ON i.id = t.invoice_id
        LEFT JOIN engagement_tasks et ON et.id = t.engagement_task_id
        WHERE t.engagement_id = $1
        ORDER BY t.work_date DESC, t.id DESC
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


@router.post("/engagements/{engagement_id}/time-entries", status_code=201)
async def add_time_entry(
    engagement_id: UUID,
    body: TimeEntryCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    work_date = body.work_date or date.today()
    description = (body.description or "").strip() or None
    worked_user_id = await _resolve_active_user(conn, body.user_id, user["id"])

    if body.engagement_task_id is not None:
        task_eng_id = await conn.fetchval(
            "SELECT engagement_id FROM engagement_tasks WHERE id = $1",
            body.engagement_task_id,
        )
        if task_eng_id is None:
            raise HTTPException(status_code=400, detail="engagement_task_id not found")
        if task_eng_id != engagement_id:
            raise HTTPException(
                status_code=400,
                detail="engagement_task_id belongs to a different engagement",
            )

    row = await conn.fetchrow(
        """
        INSERT INTO time_entries
          (engagement_id, user_id, work_date, hours, description,
           billable, hourly_rate, engagement_task_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, engagement_id, user_id, work_date, hours,
                  description, billable, hourly_rate, invoice_id,
                  engagement_task_id, created_at, updated_at
        """,
        engagement_id, worked_user_id, work_date, body.hours,
        description, body.billable, body.hourly_rate,
        body.engagement_task_id,
    )
    return dict(row)


@router.patch("/time-entries/{entry_id}")
async def update_time_entry(
    entry_id: UUID,
    body: TimeEntryUpdate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    entry = await _time_entry_or_404(conn, entry_id)
    if entry["invoice_id"] is not None:
        raise HTTPException(
            status_code=400,
            detail="Time entry is on an invoice. Void or edit the invoice first.",
        )
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "description" in fields:
        fields["description"] = (fields["description"] or "").strip() or None
    if "user_id" in fields and fields["user_id"] is not None:
        fields["user_id"] = await _resolve_active_user(
            conn, fields["user_id"], user["id"]
        )
    if "engagement_task_id" in fields and fields["engagement_task_id"] is not None:
        task_eng_id = await conn.fetchval(
            "SELECT engagement_id FROM engagement_tasks WHERE id = $1",
            fields["engagement_task_id"],
        )
        if task_eng_id is None:
            raise HTTPException(status_code=400, detail="engagement_task_id not found")
        if task_eng_id != entry["engagement_id"]:
            raise HTTPException(
                status_code=400,
                detail="engagement_task_id belongs to a different engagement",
            )

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    row = await conn.fetchrow(
        f"""
        UPDATE time_entries SET {set_sql} WHERE id = $1
        RETURNING id, engagement_id, user_id, work_date, hours,
                  description, billable, hourly_rate, invoice_id,
                  engagement_task_id, created_at, updated_at
        """,
        entry_id,
        *fields.values(),
    )
    return dict(row)


@router.delete("/time-entries/{entry_id}", status_code=204)
async def delete_time_entry(
    entry_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Refuses to delete an entry that's already on an invoice — that
    invoice's totals are derived from this row and silently mutating
    them is bad UX. Void or edit the invoice instead."""
    entry = await _time_entry_or_404(conn, entry_id)
    if entry["invoice_id"] is not None:
        raise HTTPException(
            status_code=400,
            detail="Time entry is on an invoice. Void or edit the invoice first.",
        )
    await conn.execute("DELETE FROM time_entries WHERE id = $1", entry_id)
    return None
