from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["notes"])

# `school_visit` is retired from new notes — visits live in their own
# domain — but the enum value still exists in the database for any
# historical row, and the SPA can render it via its own label/color map.
NoteKind = Literal[
    "parent_intake",
    "student_interview",
    "second_parent",
    "call",
    "followup",
    "general",
]


# ---- I/O models ------------------------------------------------------------

class NoteCreate(BaseModel):
    kind: NoteKind = "general"
    occurred_on: date | None = None  # defaults to today
    title: str | None = None
    body: str | None = None


class NoteUpdate(BaseModel):
    kind: NoteKind | None = None
    occurred_on: date | None = None
    title: str | None = None
    body: str | None = None


# ---- Helpers ---------------------------------------------------------------

async def _engagement_or_404(conn, engagement_id: UUID):
    if not await conn.fetchval(
        "SELECT 1 FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    ):
        raise HTTPException(status_code=404, detail="Engagement not found")


async def _note_or_404(conn, note_id: UUID):
    row = await conn.fetchrow("SELECT * FROM notes WHERE id = $1", note_id)
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    return row


def _normalize(fields: dict) -> dict:
    for col in ("title", "body"):
        if col in fields and fields[col] is not None:
            fields[col] = (fields[col] or "").strip() or None
    return fields


# ---- Routes ----------------------------------------------------------------

@router.get("/engagements/{engagement_id}/notes")
async def list_notes(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    rows = await conn.fetch(
        """
        SELECT n.id, n.engagement_id, n.kind, n.occurred_on, n.title, n.body,
               n.created_by, n.created_at, n.updated_at,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS created_by_name
        FROM notes n
        LEFT JOIN people u ON u.id = n.created_by
        WHERE n.engagement_id = $1
        ORDER BY n.occurred_on DESC, n.id DESC
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


@router.post("/engagements/{engagement_id}/notes", status_code=201)
async def add_note(
    engagement_id: UUID,
    body: NoteCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    occurred_on = body.occurred_on or date.today()
    title = (body.title or "").strip() or None
    body_txt = (body.body or "").strip() or None
    row = await conn.fetchrow(
        """
        INSERT INTO notes (engagement_id, kind, occurred_on, title, body, created_by)
        VALUES ($1, $2::note_kind, $3, $4, $5, $6)
        RETURNING id, engagement_id, kind, occurred_on, title, body,
                  created_by, created_at, updated_at
        """,
        engagement_id, body.kind, occurred_on, title, body_txt, user["id"],
    )
    return dict(row)


@router.patch("/notes/{note_id}")
async def update_note(
    note_id: UUID,
    body: NoteUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _note_or_404(conn, note_id)
    fields = _normalize(body.model_dump(exclude_unset=True))
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    row = await conn.fetchrow(
        f"""
        UPDATE notes SET {set_sql} WHERE id = $1
        RETURNING id, engagement_id, kind, occurred_on, title, body,
                  created_by, created_at, updated_at
        """,
        note_id,
        *fields.values(),
    )
    return dict(row)


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(
    note_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _note_or_404(conn, note_id)
    await conn.execute("DELETE FROM notes WHERE id = $1", note_id)
    return None
