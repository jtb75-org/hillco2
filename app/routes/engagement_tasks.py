import json
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["engagement_tasks"])

TaskStatus = Literal[
    "not_started", "in_progress", "completed", "blocked", "not_applicable"
]
OwnerRole = Literal["consultant", "assistant", "both"]
ActivityKind = Literal[
    "task",
    "document_review",
    "best_environment",
    "feedback_meeting",
    "school_visit",
    "school_recommendation",
    "intake_summary",
]


# ---- Per-kind structured_content schemas -----------------------------------
#
# Validated on PATCH (and create) after the merged kind is known. The
# *_visit / *_recommendation kinds keep their structured data in their
# own tables (school_visits, school_recommendations), so the JSONB on
# the task is just an empty dict.

class _EmptyContent(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DocumentReviewContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    educational_doc_ids: list[UUID] = Field(default_factory=list)
    medical_doc_ids: list[UUID] = Field(default_factory=list)


class BestEnvironmentContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    curriculum: str = ""
    placement_size: str = ""
    social_emotional: str = ""
    extras: str = ""


class FeedbackMeetingContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recommendations: str = ""
    admissions: str = ""
    follow_on: str = ""


class IntakeSummaryContent(BaseModel):
    """Snapshot of which slice of the intake-summary read-out this row
    renders. Live data is fetched per-engagement at render time; the
    section here is the only thing the task itself owns."""
    model_config = ConfigDict(extra="forbid")
    section: Literal["contacts", "current_school", "diagnoses", "goals"]


_CONTENT_SCHEMAS: dict[str, type[BaseModel]] = {
    "task": _EmptyContent,
    "document_review": DocumentReviewContent,
    "best_environment": BestEnvironmentContent,
    "feedback_meeting": FeedbackMeetingContent,
    "school_visit": _EmptyContent,
    "school_recommendation": _EmptyContent,
    "intake_summary": IntakeSummaryContent,
}

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
    activity_kind: ActivityKind = "task"
    structured_content: dict[str, Any] | None = None


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
    activity_kind: ActivityKind | None = None
    structured_content: dict[str, Any] | None = None


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


def _maybe_json(value: Any) -> Any:
    """JSONB columns come back as Python strings without a registered
    codec. Decode for the response shape; leave non-strings alone."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _validate_structured_content(kind: str, content: dict[str, Any]) -> dict[str, Any]:
    """Validate the structured_content blob against the per-kind
    schema. Raises 400 on mismatch with the offending detail."""
    schema = _CONTENT_SCHEMAS.get(kind)
    if schema is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown activity_kind '{kind}'.",
        )
    try:
        validated = schema.model_validate(content)
    except ValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid structured_content for activity_kind={kind}: {exc.errors()}",
        ) from exc
    return validated.model_dump(mode="json")


async def _validate_document_review_doc_ids(
    conn, engagement_id: UUID, content: dict[str, Any]
) -> None:
    """For document_review activities, the doc IDs in structured_content
    must point to documents owned by this engagement, its family, or
    a student on this engagement. Anything else is a 400.

    documents are polymorphically owned via (owner_type, owner_id);
    valid ownership chains here:
      - owner_type='engagement', owner_id = this engagement
      - owner_type='family',     owner_id = this engagement's family
      - owner_type='student',    owner_id = this engagement's student
    """
    raw_ids = list(content.get("educational_doc_ids", [])) + list(
        content.get("medical_doc_ids", [])
    )
    ids = [UUID(str(i)) for i in raw_ids]
    if not ids:
        return
    eng = await conn.fetchrow(
        """
        SELECT id, family_id, student_id
        FROM engagements
        WHERE id = $1 AND deleted_at IS NULL
        """,
        engagement_id,
    )
    if eng is None:
        raise HTTPException(status_code=404, detail="Engagement not found")
    rows = await conn.fetch(
        """
        SELECT id, owner_type::text AS owner_type, owner_id
        FROM documents
        WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
        """,
        ids,
    )
    found = {r["id"]: r for r in rows}
    foreign = [str(i) for i in ids if i not in found]
    if foreign:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown document id(s): {foreign}",
        )
    bad: list[str] = []
    for doc_id, r in found.items():
        t, oid = r["owner_type"], r["owner_id"]
        ok = (
            (t == "engagement" and oid == eng["id"])
            or (t == "family" and oid == eng["family_id"])
            or (t == "student" and oid == eng["student_id"])
        )
        if not ok:
            bad.append(str(doc_id))
    if bad:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Document(s) not in this engagement's scope: {bad}. "
                "Linked documents must be owned by the engagement, its "
                "family, or its student."
            ),
        )


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
               si.default_activity_kind, si.intake_summary_section,
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
    include_skipped: bool = Query(
        False,
        description=(
            "When false (default), tasks with status='not_applicable' are "
            "excluded from the response. Linked school_visits / "
            "school_recommendations stay visible on their own queries "
            "regardless of their orchestrating task's status."
        ),
    ),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Tasks for an engagement, sorted by their snapshotted phase order
    then by per-phase sort_order. Tasks with no phase (ad-hoc) come last."""
    await _engagement_or_404(conn, engagement_id)
    skip_clause = (
        ""
        if include_skipped
        else "AND t.status::text <> 'not_applicable'"
    )
    rows = await conn.fetch(
        f"""
        SELECT t.id, t.engagement_id, t.service_item_id, t.phase_id,
               t.title, t.description, t.status,
               t.activity_kind, t.structured_content,
               t.est_hours, t.actual_hours, t.billable,
               t.deliverable, t.owner_role, t.assignee_id, t.sort_order,
               t.completed_at, t.notes, t.created_at, t.updated_at,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS assignee_name,
               cp.title AS phase_title,
               cp.sort_order AS phase_sort_order
        FROM engagement_tasks t
        LEFT JOIN people u ON u.id = t.assignee_id
        LEFT JOIN catalog_phases cp ON cp.id = t.phase_id
        WHERE t.engagement_id = $1 {skip_clause}
        ORDER BY cp.sort_order NULLS LAST, t.sort_order, t.title
        """,
        engagement_id,
    )
    out = []
    for r in rows:
        d = dict(r)
        d["structured_content"] = _maybe_json(d.get("structured_content")) or {}
        out.append(d)
    return out


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

    content = body.structured_content or {}
    content = _validate_structured_content(body.activity_kind, content)
    if body.activity_kind == "document_review":
        await _validate_document_review_doc_ids(conn, engagement_id, content)

    row = await conn.fetchrow(
        """
        INSERT INTO engagement_tasks (
          engagement_id, phase_id, title, description,
          est_hours, actual_hours, billable, deliverable, owner_role,
          assignee_id, sort_order, notes, created_by,
          activity_kind, structured_content
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9::owner_role, $10, $11, $12, $13,
          $14::activity_kind, $15::jsonb
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
        body.activity_kind,
        json.dumps(content),
    )
    out = dict(row)
    out["structured_content"] = _maybe_json(out.get("structured_content")) or {}
    return out


async def seed_catalog_for_engagement(
    conn,
    *,
    engagement_id: UUID,
    engagement_type: str,
    user_id: UUID,
    service_item_ids: list[UUID] | None = None,
) -> dict:
    """Snapshot applicable service_items into engagement_tasks. Idempotent
    per (engagement_id, service_item_id) — already-seeded items are skipped
    so callers can re-run safely.

    service_item_ids=None means "every applicable item for engagement_type",
    used by the intake-convert auto-seed. A list means "only these IDs that
    are also applicable", used by the explicit bulk-from-catalog endpoint.
    """
    items = await conn.fetch(
        """
        SELECT si.id, si.phase_id, si.title, si.description, si.sort_order,
               si.default_est_hours, si.default_billable,
               si.default_deliverable, si.default_owner_role,
               si.default_activity_kind, si.intake_summary_section
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
          AND ($2::uuid[] IS NULL OR si.id = ANY($2::uuid[]))
        ORDER BY cp.sort_order, si.sort_order
        """,
        engagement_type, service_item_ids,
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
        # Snapshot the section into structured_content for
        # intake_summary kinds so the body renders without re-joining
        # service_items. Other kinds start with the empty dict.
        if (
            s["default_activity_kind"] == "intake_summary"
            and s["intake_summary_section"]
        ):
            structured = json.dumps({"section": s["intake_summary_section"]})
        else:
            structured = "{}"
        new_id = await conn.fetchval(
            """
            INSERT INTO engagement_tasks (
              engagement_id, service_item_id, phase_id,
              title, description,
              est_hours, billable, deliverable, owner_role,
              sort_order, created_by, activity_kind,
              structured_content
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
              $12::activity_kind, $13::jsonb
            )
            RETURNING id
            """,
            engagement_id, s["id"], s["phase_id"],
            s["title"], s["description"],
            s["default_est_hours"], s["default_billable"],
            s["default_deliverable"], s["default_owner_role"],
            s["sort_order"], user_id, s["default_activity_kind"],
            structured,
        )
        created_ids.append(new_id)
    return {"matched_applicable": len(items), "created_ids": created_ids}


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
    result = await seed_catalog_for_engagement(
        conn,
        engagement_id=engagement_id,
        engagement_type=eng["engagement_type"],
        user_id=user["id"],
        service_item_ids=body.service_item_ids,
    )
    return {
        "requested": len(body.service_item_ids),
        "matched_applicable": result["matched_applicable"],
        "created": len(result["created_ids"]),
        "task_ids": [str(i) for i in result["created_ids"]],
    }


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: UUID,
    body: TaskUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    task = await _task_or_404(conn, task_id)
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

    # Compute the FINAL activity_kind for validation. If the PATCH
    # changes kind without supplying matching content, we reset the
    # JSONB to empty for the new kind (avoids stale keys leaking from
    # the previous shape).
    final_kind = fields.get("activity_kind", task["activity_kind"])
    kind_changed = "activity_kind" in fields and fields["activity_kind"] != task["activity_kind"]
    if kind_changed and "structured_content" not in fields:
        fields["structured_content"] = {}

    if "structured_content" in fields:
        validated = _validate_structured_content(
            final_kind, fields["structured_content"] or {}
        )
        if final_kind == "document_review":
            await _validate_document_review_doc_ids(
                conn, task["engagement_id"], validated
            )
        fields["structured_content"] = json.dumps(validated)

    set_sql_parts = []
    values = []
    for col, val in fields.items():
        values.append(val)
        if col == "owner_role":
            set_sql_parts.append(f"owner_role = ${len(values)+1}::owner_role")
        elif col == "activity_kind":
            set_sql_parts.append(f"activity_kind = ${len(values)+1}::activity_kind")
        elif col == "structured_content":
            set_sql_parts.append(f"structured_content = ${len(values)+1}::jsonb")
        else:
            set_sql_parts.append(f"{col} = ${len(values)+1}")
    set_sql = ", ".join(set_sql_parts)
    row = await conn.fetchrow(
        f"UPDATE engagement_tasks SET {set_sql} WHERE id = $1 RETURNING *",
        task_id,
        *values,
    )
    out = dict(row)
    out["structured_content"] = _maybe_json(out.get("structured_content")) or {}
    return out


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
