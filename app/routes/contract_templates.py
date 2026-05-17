"""Contract templates — the standard markdown bodies that get cloned
into an agreement at create time. PR-Tail step 1: store + admin CRUD.
Variable extraction + per-agreement snapshotting + PDF rendering land
in later steps.

Convention: placeholders use {{snake_case}} syntax. Variables are
auto-extracted from the body via a simple regex; templates don't
declare their variable list separately.
"""
import re
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn
from .agreements import build_render_context

router = APIRouter(prefix="/api", tags=["contract_templates"])


# Each variable name maps to a hint about where its auto-fill value
# WOULD come from. The SPA uses this to render a "(read from X)" badge
# beside each missing variable and a deep link to fix it at the source.
# Variables not in this map default to 'agreement-override' — the
# operator types the value inline.
VARIABLE_HINTS: dict[str, str] = {
    # Lead consultant's people record
    "consultant_name":    "lead_consultant",
    "consultant_email":   "lead_consultant",
    "consultant_phone":   "lead_consultant",
    "consultant_address": "lead_consultant_or_firm_settings",
    # Firm-wide
    "governing_state":               "firm_settings",
    "billing_increment_minutes":     "firm_settings",
    "invoice_frequency":             "firm_settings",
    "payment_terms_days":            "firm_settings",
    "expense_approval_threshold":    "firm_settings",
    "firm_name":                     "firm_settings",
    "firm_address":                  "firm_settings",
    # Engagement
    "hourly_rate":     "engagement",
    "effective_date":  "engagement",
    # Family
    "client_name":     "family",
    "client_address":  "family",
    # Student
    "patient_full_name": "student",
    "patient_dob":       "student",
}


AgreementType = Literal["services_contract", "medical_release"]


# {{snake_case}} pattern: lowercase letters, digits, underscores; at
# least two characters to dodge accidental matches like {{x}}.
_VARIABLE_RE = re.compile(r"\{\{\s*([a-z][a-z0-9_]{1,})\s*\}\}")


def _extract_variables(body: str) -> list[str]:
    """Return unique variable names found in the body, in first-seen order."""
    seen: dict[str, None] = {}
    for m in _VARIABLE_RE.finditer(body or ""):
        seen.setdefault(m.group(1), None)
    return list(seen.keys())


# ---- I/O models ------------------------------------------------------------

class TemplateCreate(BaseModel):
    kind: AgreementType
    name: str = Field(..., min_length=1)
    body_markdown: str = Field(..., min_length=1)
    is_active: bool = True
    sort_order: int = 0


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    body_markdown: str | None = Field(default=None, min_length=1)
    is_active: bool | None = None
    sort_order: int | None = None


# ---- Helpers --------------------------------------------------------------

async def _template_or_404(conn, template_id: UUID):
    row = await conn.fetchrow(
        "SELECT * FROM contract_templates WHERE id = $1 AND deleted_at IS NULL",
        template_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return row


def _enrich(row: dict) -> dict:
    out = dict(row)
    out["variables"] = _extract_variables(out.get("body_markdown") or "")
    return out


# ---- Routes ---------------------------------------------------------------

@router.get("/contract-templates")
async def list_templates(
    kind: AgreementType | None = Query(None, description="Filter by agreement type"),
    include_inactive: bool = Query(False),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """List templates, newest-first per kind by sort_order. Returns
    each with its auto-extracted variable list so the admin UI can
    show what fillins will be required."""
    clauses = ["deleted_at IS NULL"]
    args: list = []
    if kind is not None:
        clauses.append(f"kind = ${len(args)+1}::agreement_type")
        args.append(kind)
    if not include_inactive:
        clauses.append("is_active = TRUE")
    where = " AND ".join(clauses)
    rows = await conn.fetch(
        f"""
        SELECT id, kind, name, body_markdown, is_active, sort_order,
               created_at, updated_at
        FROM contract_templates
        WHERE {where}
        ORDER BY kind, sort_order, name
        """,
        *args,
    )
    return [_enrich(r) for r in rows]


@router.get("/contract-templates/{template_id}")
async def get_template(
    template_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    row = await _template_or_404(conn, template_id)
    return _enrich(row)


@router.post("/contract-templates", status_code=201)
async def create_template(
    body: TemplateCreate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    row = await conn.fetchrow(
        """
        INSERT INTO contract_templates
          (kind, name, body_markdown, is_active, sort_order)
        VALUES ($1::agreement_type, $2, $3, $4, $5)
        RETURNING id, kind, name, body_markdown, is_active, sort_order,
                  created_at, updated_at
        """,
        body.kind,
        body.name.strip(),
        body.body_markdown,
        body.is_active,
        body.sort_order,
    )
    return _enrich(row)


@router.patch("/contract-templates/{template_id}")
async def update_template(
    template_id: UUID,
    body: TemplateUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _template_or_404(conn, template_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "name" in fields and fields["name"] is not None:
        fields["name"] = fields["name"].strip()

    sets = []
    args: list = [template_id]
    for col, val in fields.items():
        args.append(val)
        sets.append(f"{col} = ${len(args)}")
    sets.append("updated_at = NOW()")
    row = await conn.fetchrow(
        f"""
        UPDATE contract_templates SET {", ".join(sets)}
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, kind, name, body_markdown, is_active, sort_order,
                  created_at, updated_at
        """,
        *args,
    )
    return _enrich(row)


@router.delete("/contract-templates/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete. Existing agreements that referenced this template
    keep their snapshotted body_markdown intact (added in PR-Tail-2),
    so soft-delete is safe."""
    await _template_or_404(conn, template_id)
    await conn.execute(
        "UPDATE contract_templates SET deleted_at = NOW() WHERE id = $1",
        template_id,
    )
    return None


@router.get("/contract-templates/{template_id}/render-context")
async def template_render_context(
    template_id: UUID,
    engagement_id: UUID = Query(..., description="Engagement to compute defaults for"),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Preview the render context for a template against a specific
    engagement, returning what's auto-filled, what's missing, and a
    hint about where each missing variable's value would come from.

    Used by the New Agreement dialog to surface a variable input form
    for placeholders that don't auto-fill, gated so the operator can't
    create a half-filled contract."""
    template = await _template_or_404(conn, template_id)
    # Confirm engagement exists (don't leak details on no-permission;
    # require_user already authenticated).
    if not await conn.fetchval(
        "SELECT 1 FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    ):
        raise HTTPException(status_code=404, detail="Engagement not found")

    body = template["body_markdown"]
    detected = _extract_variables(body or "")
    defaults = await build_render_context(conn, engagement_id)

    # A variable is "filled" iff the merged context has a truthy value
    # for it — blank strings count as missing so the operator can't
    # ship a contract with an unfilled placeholder hidden as "".
    filled = {k: v for k, v in defaults.items() if k in detected and v not in (None, "")}
    missing = [v for v in detected if v not in filled]
    hints = {v: VARIABLE_HINTS.get(v, "agreement-override") for v in missing}

    return {
        "template_id": str(template_id),
        "detected": detected,
        "filled": filled,
        "missing": missing,
        "hints": hints,
    }
