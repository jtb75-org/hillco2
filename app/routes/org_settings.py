"""Firm-wide configuration — single row, edited from Catalog → Firm
settings, consumed by the contract render-context helper and (later)
invoice / agreement metadata.

The schema is a singleton (id=1 enforced via CHECK). Routes intentionally
don't expose the id; it's an implementation detail.
"""
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_admin, require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["org_settings"])


class OrgSettingsUpdate(BaseModel):
    firm_name: str | None = None
    firm_street1: str | None = None
    firm_street2: str | None = None
    firm_city: str | None = None
    firm_state: str | None = None
    firm_postal_code: str | None = None
    firm_country: str | None = None
    governing_state: str | None = None
    billing_increment_minutes: int | None = Field(default=None, ge=1, le=240)
    invoice_frequency: str | None = None
    payment_terms_days: int | None = Field(default=None, ge=1, le=365)
    expense_approval_threshold: Decimal | None = Field(default=None, ge=0)


@router.get("/org-settings")
async def get_org_settings(
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    row = await conn.fetchrow("SELECT * FROM org_settings WHERE id = 1")
    if row is None:
        # Defensive: the migration seeds id=1, but if anything ever
        # deletes it we self-heal rather than 404.
        await conn.execute("INSERT INTO org_settings (id) VALUES (1)")
        row = await conn.fetchrow("SELECT * FROM org_settings WHERE id = 1")
    out = dict(row)
    out.pop("id", None)
    return out


@router.patch("/org-settings")
async def update_org_settings(
    body: OrgSettingsUpdate,
    _user=Depends(require_admin),
    conn=Depends(get_conn),
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Blank strings normalize to NULL for text-shaped fields.
    for col, val in list(fields.items()):
        if isinstance(val, str):
            fields[col] = val.strip() or None

    set_sql = ", ".join(f"{col} = ${i + 1}" for i, col in enumerate(fields))
    set_sql += f", updated_at = ${len(fields) + 1}"
    row = await conn.fetchrow(
        f"""
        UPDATE org_settings SET {set_sql} WHERE id = 1
        RETURNING *
        """,
        *fields.values(),
        datetime.now(UTC),
    )
    out = dict(row)
    out.pop("id", None)
    return out
