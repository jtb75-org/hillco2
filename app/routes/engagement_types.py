"""Engagement types CRUD.

The `engagement_types` table replaces the old hardcoded Python dict
(ENGAGEMENT_TYPE_SCOPES) — consultants can add new types from the SPA
without a code change. Each type has a stable `code` slug (referenced
by `engagements.engagement_type` and the
`service_item_engagement_types` M2M) and an editable `label` shown in
the UI. Soft delete only; historical engagements keep their type
reference intact.
"""
import re
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api/engagement-types", tags=["engagement-types"])


_CODE_RE = re.compile(r"^[a-z][a-z0-9_]*$")


BillingMode = Literal["hourly", "fixed"]


class EngagementTypeCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    sort_order: int = 0
    billing_mode: BillingMode = "hourly"
    default_fixed_fee: Decimal | None = Field(default=None, ge=0)


class EngagementTypeUpdate(BaseModel):
    # Code is intentionally immutable post-create: engagements and the
    # M2M reference it as a stable identifier. Use a soft-delete +
    # create-new flow if you really need a different code.
    label: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    sort_order: int | None = None
    billing_mode: BillingMode | None = None
    default_fixed_fee: Decimal | None = Field(default=None, ge=0)


def _billing_fields(billing_mode: str | None, default_fixed_fee, *, current_mode=None):
    """Normalize + validate the billing_mode / default_fixed_fee pair.

    A fixed type must carry a price; an hourly type must not. Returns the
    (mode, fee) to persist, or raises 400. `current_mode` is the stored
    mode for partial (PATCH) updates that only touch one of the two.
    """
    mode = billing_mode if billing_mode is not None else current_mode
    if mode == "hourly":
        return "hourly", None
    if mode == "fixed":
        if default_fixed_fee is None:
            raise HTTPException(
                status_code=400,
                detail="A fixed-billing engagement type needs a default fixed fee.",
            )
        return "fixed", default_fixed_fee
    return mode, default_fixed_fee


def _normalize_code(code: str) -> str:
    code = code.strip().lower()
    if not _CODE_RE.match(code):
        raise HTTPException(
            status_code=400,
            detail=(
                "code must start with a letter and contain only lowercase "
                "letters, digits, and underscores."
            ),
        )
    return code


@router.get("")
async def list_types(
    include_deleted: bool = False,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    where = "" if include_deleted else "WHERE deleted_at IS NULL"
    rows = await conn.fetch(
        f"""
        SELECT id, code, label, description, sort_order,
               billing_mode, default_fixed_fee,
               created_at, updated_at, deleted_at
        FROM engagement_types
        {where}
        ORDER BY sort_order, label
        """
    )
    return [dict(r) for r in rows]


@router.post("", status_code=201)
async def create_type(
    body: EngagementTypeCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    code = _normalize_code(body.code)
    existing = await conn.fetchval(
        "SELECT 1 FROM engagement_types WHERE code = $1", code,
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"engagement_type '{code}' already exists")
    billing_mode, default_fixed_fee = _billing_fields(
        body.billing_mode, body.default_fixed_fee,
    )
    row = await conn.fetchrow(
        """
        INSERT INTO engagement_types
          (code, label, description, sort_order, billing_mode, default_fixed_fee)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        """,
        code,
        body.label.strip(),
        (body.description or "").strip() or None,
        body.sort_order,
        billing_mode,
        default_fixed_fee,
    )
    return dict(row)


@router.patch("/{type_id}")
async def update_type(
    type_id: UUID,
    body: EngagementTypeUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    if not await conn.fetchval(
        "SELECT 1 FROM engagement_types WHERE id = $1", type_id,
    ):
        raise HTTPException(status_code=404, detail="engagement_type not found")
    fields = body.model_dump(exclude_unset=True)
    if "label" in fields and fields["label"] is not None:
        fields["label"] = fields["label"].strip()
    if "description" in fields:
        fields["description"] = (fields["description"] or "").strip() or None
    # Billing mode + fee must stay consistent (DB CHECK). Whenever either is
    # touched, resolve the pair against the stored values and write both.
    if "billing_mode" in fields or "default_fixed_fee" in fields:
        cur = await conn.fetchrow(
            "SELECT billing_mode, default_fixed_fee FROM engagement_types WHERE id = $1",
            type_id,
        )
        mode = fields.get("billing_mode", cur["billing_mode"])
        fee = fields.get("default_fixed_fee", cur["default_fixed_fee"])
        fields["billing_mode"], fields["default_fixed_fee"] = _billing_fields(mode, fee)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    row = await conn.fetchrow(
        f"UPDATE engagement_types SET {set_sql} WHERE id = $1 RETURNING *",
        type_id,
        *fields.values(),
    )
    return dict(row)


@router.delete("/{type_id}", status_code=204)
async def soft_delete_type(
    type_id: UUID,
    reassign_to: UUID | None = Query(
        None,
        description="Move this type's catalog activities to this live type before removing.",
    ),
    force: bool = Query(
        False,
        description="Remove even though activities are mapped, leaving them unmapped.",
    ),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete only (a hard delete would violate the engagements FK,
    ON DELETE RESTRICT).

    Guarded so the catalog can't be silently orphaned: a type with catalog
    activities mapped to it is refused (409) unless the caller either
    `reassign_to` another live type (moves the mappings first) or passes
    `force=true` (removes anyway, leaving those activities unmapped).
    Existing engagements keep their type reference either way — soft-delete
    preserves the row and their task lists are frozen snapshots."""
    if not await conn.fetchval(
        "SELECT 1 FROM engagement_types WHERE id = $1", type_id,
    ):
        raise HTTPException(status_code=404, detail="engagement_type not found")

    # Count only activities that are actually live (their phase isn't
    # soft-deleted) — matches what the catalog UI shows and what seeds.
    n_activities = (
        await conn.fetchval(
            """
            SELECT count(*)
            FROM service_item_engagement_types siet
            JOIN service_items si
              ON si.id = siet.service_item_id AND si.deleted_at IS NULL
            JOIN catalog_phases cp
              ON cp.id = si.phase_id AND cp.deleted_at IS NULL
            WHERE siet.engagement_type_id = $1
            """,
            type_id,
        )
        or 0
    )

    if n_activities and reassign_to is None and not force:
        raise HTTPException(
            status_code=409,
            detail=(
                f"{n_activities} "
                f"{'activity is' if n_activities == 1 else 'activities are'} "
                "mapped to this type. Reassign "
                f"{'it' if n_activities == 1 else 'them'} to another type, "
                "or force removal."
            ),
        )

    if reassign_to is not None:
        if reassign_to == type_id:
            raise HTTPException(
                status_code=400, detail="reassign_to must be a different type."
            )
        if not await conn.fetchval(
            "SELECT 1 FROM engagement_types WHERE id = $1 AND deleted_at IS NULL",
            reassign_to,
        ):
            raise HTTPException(
                status_code=400, detail="reassign_to must be a live engagement type."
            )
        # Move this type's activity mappings to the target (skip dupes).
        await conn.execute(
            """
            INSERT INTO service_item_engagement_types (service_item_id, engagement_type_id)
            SELECT siet.service_item_id, $2
            FROM service_item_engagement_types siet
            WHERE siet.engagement_type_id = $1
              AND NOT EXISTS (
                SELECT 1 FROM service_item_engagement_types x
                WHERE x.service_item_id = siet.service_item_id
                  AND x.engagement_type_id = $2
              )
            """,
            type_id, reassign_to,
        )

    # Drop this type's activity mappings (now reassigned, or force-removed).
    await conn.execute(
        "DELETE FROM service_item_engagement_types WHERE engagement_type_id = $1",
        type_id,
    )
    await conn.execute(
        """
        UPDATE engagement_types
        SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        """,
        type_id,
    )
    return None


@router.post("/{type_id}/restore")
async def restore_type(
    type_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Undo a soft delete. No-op if the type is already live."""
    row = await conn.fetchrow(
        """
        UPDATE engagement_types
        SET deleted_at = NULL
        WHERE id = $1
        RETURNING *
        """,
        type_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="engagement_type not found")
    return dict(row)
