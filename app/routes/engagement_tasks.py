from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["engagement_tasks"])

TaskStatus = Literal[
    "not_started", "in_progress", "completed", "blocked", "not_applicable"
]
OwnerRole = Literal["consultant", "assistant", "both"]

# Engagement-type → service-item membership now lives in the database
# (service_item_engagement_types M2M, see migration 0003). This module
# JOINs through it; the old hardcoded ENGAGEMENT_TYPE_SCOPES dict is
# gone now that types are user-managed.


# ---- I/O models ------------------------------------------------------------

class TaskCreate(BaseModel):
    """Ad-hoc task. For seeding from the catalog use the bulk endpoint."""
    title: str = Field(..., min_length=1)
    description: str | None = None
    phase_id: UUID | None = None
    est_hours: Decimal | None = Field(default=None, ge=0)
    actual_hours: Decimal | None = Field(default=None, ge=0)
    billable: bool = True
    deliverable: str | None = None
    owner_role: OwnerRole | None = None
    assignee_id: UUID | None = None
    sort_order: int = 0
    notes: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    phase_id: UUID | None = None
    est_hours: Decimal | None = Field(default=None, ge=0)
    actual_hours: Decimal | None = Field(default=None, ge=0)
    billable: bool | None = None
    deliverable: str | None = None
    owner_role: OwnerRole | None = None
    assignee_id: UUID | None = None
    sort_order: int | None = None
    notes: str | None = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class BulkFromCatalog(BaseModel):
    service_item_ids: list[UUID] = Field(..., min_length=1)


# ---- Helpers ---------------------------------------------------------------

async def _engagement_or_404(conn, engagement_id: UUID):
    row = await conn.fetchrow(
        "SELECT id, engagement_type FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return row


async def _task_or_404(conn, task_id: UUID):
    row = await conn.fetchrow("SELECT * FROM engagement_tasks WHERE id = $1", task_id)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


# ---- Routes ----------------------------------------------------------------

@router.get("/engagements/{engagement_id}/catalog")
async def applicable_catalog(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Phases + service items applicable to this engagement's type. The
    SPA's "seed the plan" UI calls this; only items whose
    service_item_engagement_types row matches the engagement's type
    are returned, and a phase is only included if it has at least one
    such item."""
    eng = await _engagement_or_404(conn, engagement_id)

    items = await conn.fetch(
        """
        SELECT si.id, si.phase_id, si.title, si.description, si.sort_order,
               si.default_est_hours, si.default_billable,
               si.default_deliverable, si.default_owner_role,
               cp.sort_order AS phase_sort_order, cp.title AS phase_title
        FROM service_items si
        JOIN service_item_engagement_types siet ON siet.service_item_id = si.id
        JOIN engagement_types et
          ON et.id = siet.engagement_type_id
         AND et.deleted_at IS NULL
        JOIN catalog_phases cp
          ON cp.id = si.phase_id
         AND cp.deleted_at IS NULL
        WHERE si.deleted_at IS NULL
          AND et.code = $1
        ORDER BY cp.sort_order, cp.title, si.sort_order, si.title
        """,
        eng["engagement_type"],
    )

    # Build the phase wrappers in first-seen order so the response
    # mirrors the SQL's catalog ordering.
    phases_seen: dict[UUID, dict] = {}
    for it in items:
        phase_id = it["phase_id"]
        if phase_id not in phases_seen:
            phases_seen[phase_id] = {
                "id": phase_id,
                "sort_order": it["phase_sort_order"],
                "title": it["phase_title"],
                "description": None,
                "est_hours": None,
                "default_billable": True,
                "items": [],
            }
        item = dict(it)
        for k in ("phase_sort_order", "phase_title"):
            item.pop(k, None)
        phases_seen[phase_id]["items"].append(item)

    # Top up phase metadata (description, est_hours, default_billable)
    # for any phase that's in the result set. Single batched fetch.
    if phases_seen:
        meta = await conn.fetch(
            """
            SELECT id, description, est_hours, default_billable
            FROM catalog_phases
            WHERE id = ANY($1::uuid[])
            """,
            list(phases_seen.keys()),
        )
        for m in meta:
            ph = phases_seen.get(m["id"])
            if ph:
                ph["description"] = m["description"]
                ph["est_hours"] = m["est_hours"]
                ph["default_billable"] = m["default_billable"]

    return list(phases_seen.values())


@router.get("/engagements/{engagement_id}/tasks")
async def list_tasks(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Tasks for an engagement, sorted by their snapshotted phase order
    then by per-phase sort_order. Tasks with no phase (ad-hoc) come last."""
    await _engagement_or_404(conn, engagement_id)
    rows = await conn.fetch(
        """
        SELECT t.id, t.engagement_id, t.service_item_id, t.phase_id,
               t.title, t.description, t.status,
               t.est_hours, t.actual_hours, t.billable,
               t.deliverable, t.owner_role, t.assignee_id, t.sort_order,
               t.completed_at, t.notes, t.created_at, t.updated_at,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS assignee_name,
               cp.title AS phase_title,
               cp.sort_order AS phase_sort_order
        FROM engagement_tasks t
        LEFT JOIN people u ON u.id = t.assignee_id
        LEFT JOIN catalog_phases cp ON cp.id = t.phase_id
        WHERE t.engagement_id = $1
        ORDER BY cp.sort_order NULLS LAST, t.sort_order, t.title
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


@router.post("/engagements/{engagement_id}/tasks", status_code=201)
async def add_task(
    engagement_id: UUID,
    body: TaskCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    if body.phase_id is not None:
        if not await conn.fetchval(
            "SELECT 1 FROM catalog_phases WHERE id = $1 AND deleted_at IS NULL",
            body.phase_id,
        ):
            raise HTTPException(status_code=400, detail="phase_id does not match an active phase")

    row = await conn.fetchrow(
        """
        INSERT INTO engagement_tasks (
          engagement_id, phase_id, title, description,
          est_hours, actual_hours, billable, deliverable, owner_role,
          assignee_id, sort_order, notes, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9::owner_role, $10, $11, $12, $13
        )
        RETURNING *
        """,
        engagement_id, body.phase_id,
        body.title.strip(),
        (body.description or "").strip() or None,
        body.est_hours, body.actual_hours, body.billable,
        (body.deliverable or "").strip() or None,
        body.owner_role,
        body.assignee_id, body.sort_order,
        (body.notes or "").strip() or None,
        user["id"],
    )
    return dict(row)


@router.post("/engagements/{engagement_id}/tasks/bulk-from-catalog", status_code=201)
async def bulk_from_catalog(
    engagement_id: UUID,
    body: BulkFromCatalog,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Snapshot the selected service_items into engagement_tasks. Idempotent
    per (engagement_id, service_item_id) — already-seeded items are skipped
    so calling this again to add newly-checked items is safe."""
    eng = await _engagement_or_404(conn, engagement_id)

    items = await conn.fetch(
        """
        SELECT si.id, si.phase_id, si.title, si.description, si.sort_order,
               si.default_est_hours, si.default_billable,
               si.default_deliverable, si.default_owner_role
        FROM service_items si
        JOIN service_item_engagement_types siet ON siet.service_item_id = si.id
        JOIN engagement_types et
          ON et.id = siet.engagement_type_id
         AND et.deleted_at IS NULL
        JOIN catalog_phases cp
          ON cp.id = si.phase_id
         AND cp.deleted_at IS NULL
        WHERE si.id = ANY($1::uuid[])
          AND si.deleted_at IS NULL
          AND et.code = $2
        """,
        body.service_item_ids, eng["engagement_type"],
    )

    created_ids: list[UUID] = []
    for s in items:
        existing = await conn.fetchval(
            """
            SELECT id FROM engagement_tasks
            WHERE engagement_id = $1 AND service_item_id = $2
            """,
            engagement_id, s["id"],
        )
        if existing:
            continue
        new_id = await conn.fetchval(
            """
            INSERT INTO engagement_tasks (
              engagement_id, service_item_id, phase_id,
              title, description,
              est_hours, billable, deliverable, owner_role,
              sort_order, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
            """,
            engagement_id, s["id"], s["phase_id"],
            s["title"], s["description"],
            s["default_est_hours"], s["default_billable"],
            s["default_deliverable"], s["default_owner_role"],
            s["sort_order"], user["id"],
        )
        created_ids.append(new_id)

    return {
        "requested": len(body.service_item_ids),
        "matched_applicable": len(items),
        "created": len(created_ids),
        "task_ids": [str(i) for i in created_ids],
    }


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: UUID,
    body: TaskUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _task_or_404(conn, task_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    for col in ("title", "description", "deliverable", "notes"):
        if col in fields and fields[col] is not None:
            fields[col] = (fields[col] or "").strip() or None
    if "phase_id" in fields and fields["phase_id"] is not None:
        if not await conn.fetchval(
            "SELECT 1 FROM catalog_phases WHERE id = $1 AND deleted_at IS NULL",
            fields["phase_id"],
        ):
            raise HTTPException(status_code=400, detail="phase_id does not match an active phase")

    set_sql_parts = []
    values = []
    for col, val in fields.items():
        values.append(val)
        if col == "owner_role":
            set_sql_parts.append(f"owner_role = ${len(values)+1}::owner_role")
        else:
            set_sql_parts.append(f"{col} = ${len(values)+1}")
    set_sql = ", ".join(set_sql_parts)
    row = await conn.fetchrow(
        f"UPDATE engagement_tasks SET {set_sql} WHERE id = $1 RETURNING *",
        task_id,
        *values,
    )
    return dict(row)


@router.post("/tasks/{task_id}/status")
async def update_task_status(
    task_id: UUID,
    body: TaskStatusUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Dedicated transition; auto-stamps completed_at on 'completed' and
    clears it on any other status."""
    await _task_or_404(conn, task_id)
    row = await conn.fetchrow(
        """
        UPDATE engagement_tasks
        SET status = $1::task_status,
            completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END
        WHERE id = $2
        RETURNING *
        """,
        body.status, task_id,
    )
    return dict(row)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _task_or_404(conn, task_id)
    await conn.execute("DELETE FROM engagement_tasks WHERE id = $1", task_id)
    return None
