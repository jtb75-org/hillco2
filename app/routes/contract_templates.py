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
    "consultant_phone":   "lead_consultant_or_firm_settings",
    "consultant_address": "lead_consultant_or_firm_settings",
    # Firm-wide
    "consultant_company":            "firm_settings",
    "governing_state":               "firm_settings",
    "billing_increment_minutes":     "firm_settings",
    "invoice_frequency":             "firm_settings",
    "payment_terms_days":            "firm_settings",
    "expense_approval_threshold":    "firm_settings",
    "firm_name":                     "firm_settings",
    "firm_address":                  "firm_settings",
    # Engagement
    "hourly_rate":     "engagement",
    "fixed_fee":       "engagement",
    "fixed_fee_half":  "engagement",  # 50% installment, derived from fixed_fee
    "scope_of_services": "engagement",
    "effective_date":  "engagement",
    # Fixed-bid, operator-typed
    "payment_schedule": "agreement-override",
    # Family
    "client_name":     "family",
    # client_address auto-fills from the billing-flagged guardian's
    # people.billing_* (or mailing) columns. When unset, the link
    # sends the operator to the family page where they can flip the
    # billing flag and fill in the address.
    "client_address":  "family",
    # Student
    "patient_full_name": "student",
    "patient_dob":       "student",
    # Medical-release parent/guardian block — sourced from the family's
    # billing/primary guardian (the minor patient shares the household).
    "parent_guardian_name":         "family",
    "parent_guardian_relationship": "family",
    "patient_address":              "family",
    "patient_city_state_zip":       "family",
    "patient_phone":                "family",
    # Signer-provided: the releasing provider (the office that HOLDS the
    # records), the records date range, and the expiration. HillCo doesn't
    # have these — the parent/guardian fills them in on the signing page.
    "releasing_provider_name":            "signer",
    "releasing_provider_address":         "signer",
    "releasing_provider_city_state_zip":  "signer",
    "releasing_provider_phone":           "signer",
    "releasing_provider_fax":             "signer",
    "records_date_from":                  "signer",
    "records_date_to":                    "signer",
    # Single expiration choice (one year / completion / specific date / other),
    # composed by the signing page into one line.
    "expiration":                         "signer",
}

# Variables the signing party fills in on the public signing page (not the
# operator). These never block draft creation. Derived from the hints above
# so the two stay in sync.
SIGNER_VARIABLES: frozenset[str] = frozenset(
    name for name, hint in VARIABLE_HINTS.items() if hint == "signer"
)

# Signer fields rendered as date inputs on the signing page; the rest are text.
SIGNER_DATE_VARIABLES: frozenset[str] = frozenset(
    {"records_date_from", "records_date_to"}
)

# Signer fields that render as a custom control on the signing page.
SIGNER_CHOICE_VARIABLES: frozenset[str] = frozenset({"expiration"})


def variable_label(name: str) -> str:
    """Human label for a variable name (e.g. 'releasing_provider_name' ->
    'Releasing Provider Name')."""
    return name.replace("_", " ").title()


# medical_release is retired (template deactivated in 0041) but stays valid so
# the releases signed before that keep rendering.
AgreementType = Literal["services_contract", "records_request", "medical_release"]
BillingMode = Literal["hourly", "fixed"]


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
    # Only meaningful for services_contract; forced NULL for medical_release.
    billing_mode: BillingMode | None = None


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    body_markdown: str | None = Field(default=None, min_length=1)
    is_active: bool | None = None
    sort_order: int | None = None
    billing_mode: BillingMode | None = None


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
    billing_mode: BillingMode | None = Query(
        None,
        description=(
            "Preferred billing mode. Doesn't filter — orders exact matches "
            "first, then universal (null-mode) templates, so the caller can "
            "take the first result."
        ),
    ),
    include_inactive: bool = Query(False),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """List templates, newest-first per kind by sort_order. Returns
    each with its auto-extracted variable list so the admin UI can
    show what fillins will be required. When `billing_mode` is given,
    matching templates are ordered first (then universal), so a caller
    can auto-select the right services contract for an engagement."""
    clauses = ["deleted_at IS NULL"]
    args: list = []
    if kind is not None:
        clauses.append(f"kind = ${len(args)+1}::agreement_type")
        args.append(kind)
    if not include_inactive:
        clauses.append("is_active = TRUE")
    where = " AND ".join(clauses)

    if billing_mode is not None:
        args.append(billing_mode)
        # exact mode match (0) < universal/null (1) < other mode (2)
        order = (
            f"CASE WHEN billing_mode = ${len(args)} THEN 0 "
            "WHEN billing_mode IS NULL THEN 1 ELSE 2 END, kind, sort_order, name"
        )
    else:
        order = "kind, sort_order, name"

    rows = await conn.fetch(
        f"""
        SELECT id, kind, name, body_markdown, billing_mode, is_active, sort_order,
               created_at, updated_at
        FROM contract_templates
        WHERE {where}
        ORDER BY {order}
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
    # billing_mode only applies to services contracts.
    billing_mode = body.billing_mode if body.kind == "services_contract" else None
    row = await conn.fetchrow(
        """
        INSERT INTO contract_templates
          (kind, name, body_markdown, is_active, sort_order, billing_mode)
        VALUES ($1::agreement_type, $2, $3, $4, $5, $6)
        RETURNING id, kind, name, body_markdown, billing_mode, is_active, sort_order,
                  created_at, updated_at
        """,
        body.kind,
        body.name.strip(),
        body.body_markdown,
        body.is_active,
        body.sort_order,
        billing_mode,
    )
    return _enrich(row)


@router.patch("/contract-templates/{template_id}")
async def update_template(
    template_id: UUID,
    body: TemplateUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    tpl = await _template_or_404(conn, template_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "name" in fields and fields["name"] is not None:
        fields["name"] = fields["name"].strip()
    # billing_mode only applies to services contracts.
    if "billing_mode" in fields and tpl["kind"] != "services_contract":
        fields["billing_mode"] = None

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
        RETURNING id, kind, name, body_markdown, billing_mode, is_active, sort_order,
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

    Used by the New Agreement dialog to surface "go fix it at the
    source" links for missing variables, gated so the operator can't
    create a half-filled contract. The engagement / family / student
    ids in the response let the SPA build deep links to the right
    edit pages."""
    template = await _template_or_404(conn, template_id)
    eng = await conn.fetchrow(
        """
        SELECT id, family_id, student_id, lead_consultant_id
        FROM engagements WHERE id = $1 AND deleted_at IS NULL
        """,
        engagement_id,
    )
    if eng is None:
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
        "engagement_id": str(eng["id"]),
        "family_id": str(eng["family_id"]),
        "student_id": str(eng["student_id"]) if eng["student_id"] else None,
        "lead_consultant_id": str(eng["lead_consultant_id"]) if eng["lead_consultant_id"] else None,
    }
