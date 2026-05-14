from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api/catalog", tags=["catalog"])

CatalogScope = Literal["assessment", "placement"]
OwnerRole = Literal["consultant", "assistant", "both"]


# ---- I/O models ------------------------------------------------------------

class PhaseCreate(BaseModel):
    scope: CatalogScope
    sort_order: int = 0
    title: str = Field(..., min_length=1)
    description: str | None = None
    est_hours: Decimal | None = Field(default=None, ge=0)
    default_billable: bool = True


class PhaseUpdate(BaseModel):
    scope: CatalogScope | None = None
    sort_order: int | None = None
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    est_hours: Decimal | None = Field(default=None, ge=0)
    default_billable: bool | None = None


class ItemCreate(BaseModel):
    phase_id: UUID
    title: str = Field(..., min_length=1)
    description: str | None = None
    sort_order: int = 0
    default_est_hours: Decimal | None = Field(default=None, ge=0)
    default_billable: bool = True
    default_deliverable: str | None = None
    default_owner_role: OwnerRole | None = None
    # If omitted, the item gets no engagement-type membership and won't
    # be seeded onto any engagement. SPA picker controls this.
    engagement_type_ids: list[UUID] | None = None


class ItemUpdate(BaseModel):
    phase_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    sort_order: int | None = None
    default_est_hours: Decimal | None = Field(default=None, ge=0)
    default_billable: bool | None = None
    default_deliverable: str | None = None
    default_owner_role: OwnerRole | None = None
    # Replaces the item's full engagement-type membership when present.
    # Pass an empty list to clear it. Omit to leave existing memberships
    # alone (so partial PATCHes don't accidentally wipe the M2M).
    engagement_type_ids: list[UUID] | None = None


# ---- Helpers ---------------------------------------------------------------

async def _phase_or_404(conn, phase_id: UUID):
    row = await conn.fetchrow(
        "SELECT * FROM catalog_phases WHERE id = $1 AND deleted_at IS NULL",
        phase_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Phase not found")
    return row


async def _item_or_404(conn, item_id: UUID):
    row = await conn.fetchrow(
        "SELECT * FROM service_items WHERE id = $1 AND deleted_at IS NULL",
        item_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Service item not found")
    return row


async def _validate_engagement_type_ids(conn, ids: list[UUID]) -> None:
    if not ids:
        return
    rows = await conn.fetch(
        "SELECT id FROM engagement_types WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL",
        ids,
    )
    found = {r["id"] for r in rows}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown engagement_type_ids: {missing}",
        )


async def _replace_item_memberships(conn, item_id: UUID, ids: list[UUID]) -> None:
    await conn.execute(
        "DELETE FROM service_item_engagement_types WHERE service_item_id = $1",
        item_id,
    )
    if ids:
        await conn.executemany(
            """
            INSERT INTO service_item_engagement_types (service_item_id, engagement_type_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            [(item_id, et_id) for et_id in ids],
        )


async def _fetch_item_memberships(conn, item_id: UUID) -> list[UUID]:
    rows = await conn.fetch(
        "SELECT engagement_type_id FROM service_item_engagement_types WHERE service_item_id = $1",
        item_id,
    )
    return [r["engagement_type_id"] for r in rows]


def _normalize_phase(fields: dict) -> dict:
    for col in ("title", "description"):
        if col in fields and fields[col] is not None:
            fields[col] = (fields[col] or "").strip() or None
    if "title" in fields and fields["title"] is None:
        # title is NOT NULL in schema; if user sent empty after trim, raise
        raise HTTPException(status_code=400, detail="title cannot be empty")
    return fields


def _normalize_item(fields: dict) -> dict:
    for col in ("title", "description", "default_deliverable"):
        if col in fields and fields[col] is not None:
            fields[col] = (fields[col] or "").strip() or None
    if "title" in fields and fields["title"] is None:
        raise HTTPException(status_code=400, detail="title cannot be empty")
    return fields


# ---- Phase routes ----------------------------------------------------------

@router.get("/phases")
async def list_phases(
    scope: CatalogScope | None = Query(None),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """List phases with their item counts. Filter by scope when set."""
    if scope is None:
        rows = await conn.fetch(
            """
            SELECT cp.id, cp.scope, cp.sort_order, cp.title, cp.description,
                   cp.est_hours, cp.default_billable,
                   cp.created_at, cp.updated_at,
                   (SELECT COUNT(*) FROM service_items si
                      WHERE si.phase_id = cp.id AND si.deleted_at IS NULL) AS item_count
            FROM catalog_phases cp
            WHERE cp.deleted_at IS NULL
            ORDER BY cp.scope, cp.sort_order, cp.title
            """
        )
    else:
        rows = await conn.fetch(
            """
            SELECT cp.id, cp.scope, cp.sort_order, cp.title, cp.description,
                   cp.est_hours, cp.default_billable,
                   cp.created_at, cp.updated_at,
                   (SELECT COUNT(*) FROM service_items si
                      WHERE si.phase_id = cp.id AND si.deleted_at IS NULL) AS item_count
            FROM catalog_phases cp
            WHERE cp.deleted_at IS NULL AND cp.scope = $1
            ORDER BY cp.sort_order, cp.title
            """,
            scope,
        )
    return [dict(r) for r in rows]


@router.post("/phases", status_code=201)
async def create_phase(
    body: PhaseCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    title = body.title.strip()
    description = (body.description or "").strip() or None
    row = await conn.fetchrow(
        """
        INSERT INTO catalog_phases (
          scope, sort_order, title, description, est_hours, default_billable
        ) VALUES ($1::catalog_scope, $2, $3, $4, $5, $6)
        RETURNING *
        """,
        body.scope, body.sort_order, title, description,
        body.est_hours, body.default_billable,
    )
    return dict(row)


@router.get("/phases/{phase_id}")
async def get_phase(
    phase_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    phase = await _phase_or_404(conn, phase_id)
    items = await conn.fetch(
        """
        SELECT si.id, si.phase_id, si.sort_order, si.title, si.description,
               si.default_est_hours, si.default_billable, si.default_deliverable,
               si.default_owner_role, si.created_at, si.updated_at,
               COALESCE((
                 SELECT array_agg(siet.engagement_type_id)
                 FROM service_item_engagement_types siet
                 WHERE siet.service_item_id = si.id
               ), ARRAY[]::uuid[]) AS engagement_type_ids
        FROM service_items si
        WHERE si.phase_id = $1 AND si.deleted_at IS NULL
        ORDER BY si.sort_order, si.title
        """,
        phase_id,
    )
    out = dict(phase)
    out["items"] = [dict(i) for i in items]
    return out


@router.patch("/phases/{phase_id}")
async def update_phase(
    phase_id: UUID,
    body: PhaseUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _phase_or_404(conn, phase_id)
    fields = _normalize_phase(body.model_dump(exclude_unset=True))
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_sql_parts = []
    values = []
    for col, val in fields.items():
        values.append(val)
        if col == "scope":
            set_sql_parts.append(f"scope = ${len(values)+1}::catalog_scope")
        else:
            set_sql_parts.append(f"{col} = ${len(values)+1}")
    set_sql = ", ".join(set_sql_parts)
    row = await conn.fetchrow(
        f"UPDATE catalog_phases SET {set_sql} WHERE id = $1 RETURNING *",
        phase_id,
        *values,
    )
    return dict(row)


@router.delete("/phases/{phase_id}", status_code=204)
async def delete_phase(
    phase_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete. Phase rows still exist so engagement_tasks.phase_id
    snapshots stay readable; the deleted_at filter just hides them from
    the catalog UI. Active service_items still pointing at the phase
    will block hard deletes (RESTRICT FK), but soft delete is safe."""
    await _phase_or_404(conn, phase_id)
    await conn.execute(
        "UPDATE catalog_phases SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        phase_id,
    )
    return None


# ---- Service item routes ---------------------------------------------------

@router.get("/items")
async def list_items(
    phase_id: UUID | None = Query(None),
    scope: CatalogScope | None = Query(None),
    q: str = Query("", description="Substring search over title + description"),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    clauses = ["si.deleted_at IS NULL", "cp.deleted_at IS NULL"]
    args: list = []
    if phase_id is not None:
        args.append(phase_id)
        clauses.append(f"si.phase_id = ${len(args)}")
    if scope is not None:
        args.append(scope)
        clauses.append(f"cp.scope = ${len(args)}::catalog_scope")
    q = q.strip()
    if q:
        args.append(f"%{q}%")
        clauses.append(
            f"(si.title ILIKE ${len(args)} OR COALESCE(si.description,'') ILIKE ${len(args)})"
        )

    rows = await conn.fetch(
        f"""
        SELECT si.id, si.phase_id, si.title, si.description, si.sort_order,
               si.default_est_hours, si.default_billable,
               si.default_deliverable, si.default_owner_role,
               si.created_at, si.updated_at,
               cp.scope AS phase_scope, cp.title AS phase_title,
               cp.sort_order AS phase_sort_order,
               COALESCE((
                 SELECT array_agg(siet.engagement_type_id)
                 FROM service_item_engagement_types siet
                 WHERE siet.service_item_id = si.id
               ), ARRAY[]::uuid[]) AS engagement_type_ids
        FROM service_items si
        JOIN catalog_phases cp ON cp.id = si.phase_id
        WHERE {" AND ".join(clauses)}
        ORDER BY cp.scope, cp.sort_order, si.sort_order, si.title
        """,
        *args,
    )
    return [dict(r) for r in rows]


@router.post("/items", status_code=201)
async def create_item(
    body: ItemCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _phase_or_404(conn, body.phase_id)
    if body.engagement_type_ids:
        await _validate_engagement_type_ids(conn, body.engagement_type_ids)
    title = body.title.strip()
    description = (body.description or "").strip() or None
    deliverable = (body.default_deliverable or "").strip() or None
    row = await conn.fetchrow(
        """
        INSERT INTO service_items (
          phase_id, title, description, sort_order,
          default_est_hours, default_billable,
          default_deliverable, default_owner_role
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::owner_role)
        RETURNING *
        """,
        body.phase_id, title, description, body.sort_order,
        body.default_est_hours, body.default_billable,
        deliverable, body.default_owner_role,
    )
    out = dict(row)
    if body.engagement_type_ids:
        await _replace_item_memberships(conn, out["id"], body.engagement_type_ids)
    out["engagement_type_ids"] = list(body.engagement_type_ids or [])
    return out


@router.patch("/items/{item_id}")
async def update_item(
    item_id: UUID,
    body: ItemUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _item_or_404(conn, item_id)
    fields = _normalize_item(body.model_dump(exclude_unset=True))
    # Pull engagement_type_ids out of the column-update path; it's
    # stored in the M2M, not on service_items.
    engagement_type_ids = fields.pop("engagement_type_ids", None)
    if engagement_type_ids is not None:
        await _validate_engagement_type_ids(conn, engagement_type_ids)
    if not fields and engagement_type_ids is None:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "phase_id" in fields and fields["phase_id"] is not None:
        if not await conn.fetchval(
            "SELECT 1 FROM catalog_phases WHERE id = $1 AND deleted_at IS NULL",
            fields["phase_id"],
        ):
            raise HTTPException(status_code=400, detail="phase_id does not match an active phase")

    if fields:
        set_sql_parts = []
        values = []
        for col, val in fields.items():
            values.append(val)
            if col == "default_owner_role":
                set_sql_parts.append(f"default_owner_role = ${len(values)+1}::owner_role")
            else:
                set_sql_parts.append(f"{col} = ${len(values)+1}")
        set_sql = ", ".join(set_sql_parts)
        row = await conn.fetchrow(
            f"UPDATE service_items SET {set_sql} WHERE id = $1 RETURNING *",
            item_id,
            *values,
        )
    else:
        row = await conn.fetchrow("SELECT * FROM service_items WHERE id = $1", item_id)

    if engagement_type_ids is not None:
        await _replace_item_memberships(conn, item_id, engagement_type_ids)
    out = dict(row)
    out["engagement_type_ids"] = await _fetch_item_memberships(conn, item_id)
    return out


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(
    item_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete. engagement_tasks.service_item_id is ON DELETE SET NULL
    so existing tasks keep their snapshots; the catalog just stops
    surfacing this item for new selection."""
    await _item_or_404(conn, item_id)
    await conn.execute(
        "UPDATE service_items SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        item_id,
    )
    return None
