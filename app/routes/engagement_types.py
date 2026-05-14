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
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api/engagement-types", tags=["engagement-types"])


_CODE_RE = re.compile(r"^[a-z][a-z0-9_]*$")


class EngagementTypeCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    sort_order: int = 0


class EngagementTypeUpdate(BaseModel):
    # Code is intentionally immutable post-create: engagements and the
    # M2M reference it as a stable identifier. Use a soft-delete +
    # create-new flow if you really need a different code.
    label: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    sort_order: int | None = None


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
    row = await conn.fetchrow(
        """
        INSERT INTO engagement_types (code, label, description, sort_order)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        """,
        code,
        body.label.strip(),
        (body.description or "").strip() or None,
        body.sort_order,
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
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete only. Hard-deleting a type that's still referenced
    by an engagement would violate the FK (ON DELETE RESTRICT)."""
    if not await conn.fetchval(
        "SELECT 1 FROM engagement_types WHERE id = $1", type_id,
    ):
        raise HTTPException(status_code=404, detail="engagement_type not found")
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
