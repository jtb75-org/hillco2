"""Agreements: services contracts and medical releases.

Engagement-scoped legal artifacts with a shared lifecycle (draft →
active → superseded/expired/terminated). Services contracts carry an
amount and an auto-generated contract_number; medical releases don't.

Document attachment uses the existing polymorphic documents table:
documents.owner_type='agreement', owner_id=this row's id. The route
layer validates that an attached document_id actually owns this
agreement; the DB FK on agreements.document_id only enforces basic
referential integrity.
"""
import json
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn
from .documents import store_uploaded_document

router = APIRouter(prefix="/api", tags=["agreements"])


AgreementType = Literal["services_contract", "medical_release"]
AgreementStatus = Literal["draft", "active", "superseded", "expired", "terminated"]


# ---- I/O models -----------------------------------------------------------

class AgreementCreate(BaseModel):
    type: AgreementType
    amount: Decimal | None = None
    signed_at: date | None = None
    effective_date: date | None = None
    expires_at: date | None = None
    document_id: UUID | None = None
    notes: str | None = None
    # Optional template to snapshot into body_markdown. If supplied, the
    # template's kind must match `type`. Operator can also leave both
    # unset and start with a blank body — most existing draft agreements
    # have no body.
    template_id: UUID | None = None


class AgreementUpdate(BaseModel):
    status: AgreementStatus | None = None
    amount: Decimal | None = None
    sent_at: datetime | None = None
    signed_at: date | None = None
    effective_date: date | None = None
    expires_at: date | None = None
    document_id: UUID | None = None
    notes: str | None = None
    # In-place edits to the per-agreement contract body. Template_id
    # stays pinned to whatever the agreement was created from so the
    # provenance is preserved even after edits.
    body_markdown: str | None = None
    # Operator-supplied {{variable}} fillins that override auto-fill
    # defaults at render time.
    variables: dict[str, Any] | None = None


class AgreementSupersede(BaseModel):
    """Body for the supersede action — same shape as Create minus type
    (the new agreement inherits the predecessor's type)."""
    amount: Decimal | None = None
    signed_at: date | None = None
    effective_date: date | None = None
    expires_at: date | None = None
    document_id: UUID | None = None
    notes: str | None = None


# ---- Helpers --------------------------------------------------------------

async def _engagement_or_404(conn, engagement_id: UUID) -> None:
    if not await conn.fetchval(
        "SELECT 1 FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    ):
        raise HTTPException(status_code=404, detail="Engagement not found")


async def _agreement_or_404(conn, agreement_id: UUID):
    row = await conn.fetchrow("SELECT * FROM agreements WHERE id = $1", agreement_id)
    if not row:
        raise HTTPException(status_code=404, detail="Agreement not found")
    return row


async def _validate_document_for_agreement(
    conn, document_id: UUID | None, *, agreement_id: UUID | None = None,
) -> None:
    """If a document is attached, its owner_type/owner_id must point at
    THIS agreement (or be unowned/family-level — both are reasonable for
    agreements that haven't been "claimed" yet). Anything pointing at a
    different agreement, a student, or a note is a misattachment."""
    if document_id is None:
        return
    row = await conn.fetchrow(
        "SELECT owner_type, owner_id FROM documents WHERE id = $1 AND deleted_at IS NULL",
        document_id,
    )
    if row is None:
        raise HTTPException(status_code=400, detail="document_id not found.")
    if row["owner_type"] == "agreement" and (agreement_id is None or row["owner_id"] == agreement_id):
        return
    raise HTTPException(
        status_code=400,
        detail=f"document_id is owned by {row['owner_type']}; cannot attach to an agreement.",
    )


# ---- Routes ---------------------------------------------------------------

@router.get("/engagements/{engagement_id}/agreements")
async def list_for_engagement(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """All agreements for an engagement, newest first. The history
    chain (supersedes_id) is reachable via repeated detail fetches;
    this list view just orders by created_at."""
    await _engagement_or_404(conn, engagement_id)
    rows = await conn.fetch(
        """
        SELECT a.id, a.engagement_id, a.type, a.status, a.contract_number,
               a.amount, a.sent_at, a.signed_at, a.effective_date, a.expires_at,
               a.supersedes_id, a.document_id, a.notes,
               a.template_id, a.body_markdown, a.variables,
               a.created_by, a.created_at, a.updated_at,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS created_by_name
        FROM agreements a
        LEFT JOIN people u ON u.id = a.created_by
        WHERE a.engagement_id = $1
        ORDER BY a.created_at DESC, a.id DESC
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


@router.post("/engagements/{engagement_id}/agreements", status_code=201)
async def create_agreement(
    engagement_id: UUID,
    body: AgreementCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Creates a draft agreement. Use PATCH to flip status='active' once
    signed. services_contract auto-generates a contract_number (SC-YYYY-NNNN)
    via next_contract_number(); medical_release leaves it NULL.

    If template_id is supplied, the template's body_markdown is
    snapshotted into the new agreement. Operator edits via PATCH affect
    the agreement copy only — the source template is untouched."""
    await _engagement_or_404(conn, engagement_id)
    await _validate_document_for_agreement(conn, body.document_id)

    contract_number = None
    if body.type == "services_contract":
        contract_number = await conn.fetchval("SELECT next_contract_number()")

    body_markdown: str | None = None
    if body.template_id is not None:
        tpl = await conn.fetchrow(
            """
            SELECT kind, body_markdown FROM contract_templates
            WHERE id = $1 AND deleted_at IS NULL
            """,
            body.template_id,
        )
        if tpl is None:
            raise HTTPException(status_code=400, detail="template_id not found.")
        if tpl["kind"] != body.type:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"template kind '{tpl['kind']}' doesn't match "
                    f"agreement type '{body.type}'."
                ),
            )
        body_markdown = tpl["body_markdown"]

    row = await conn.fetchrow(
        """
        INSERT INTO agreements (
          engagement_id, type, status, contract_number, amount,
          signed_at, effective_date, expires_at,
          document_id, notes, created_by,
          template_id, body_markdown
        ) VALUES (
          $1, $2::agreement_type, 'draft', $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12
        )
        RETURNING *
        """,
        engagement_id, body.type, contract_number, body.amount,
        body.signed_at, body.effective_date, body.expires_at,
        body.document_id, (body.notes or "").strip() or None, user["id"],
        body.template_id, body_markdown,
    )
    return dict(row)


@router.get("/agreements/{agreement_id}")
async def agreement_detail(
    agreement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    row = await conn.fetchrow(
        """
        SELECT a.*, TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS created_by_name
        FROM agreements a
        LEFT JOIN people u ON u.id = a.created_by
        WHERE a.id = $1
        """,
        agreement_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Agreement not found")
    return dict(row)


@router.patch("/agreements/{agreement_id}")
async def update_agreement(
    agreement_id: UUID,
    body: AgreementUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Updates an existing agreement. Status transitions are validated
    only loosely here — the partial UNIQUE on active-per-type catches
    the dangerous case (two active agreements of the same type for one
    engagement). Use POST /agreements/{id}/supersede for the
    supersession-with-new-row flow."""
    await _agreement_or_404(conn, agreement_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "document_id" in fields:
        await _validate_document_for_agreement(
            conn, fields["document_id"], agreement_id=agreement_id,
        )
    if "notes" in fields:
        fields["notes"] = (fields["notes"] or "").strip() or None

    sets = []
    values = []
    for col, val in fields.items():
        if col == "status":
            sets.append(f"status = ${len(values)+2}::agreement_status")
        elif col == "variables":
            sets.append(f"variables = ${len(values)+2}::jsonb")
            val = json.dumps(val or {})
        else:
            sets.append(f"{col} = ${len(values)+2}")
        values.append(val)
    set_sql = ", ".join(sets)
    row = await conn.fetchrow(
        f"UPDATE agreements SET {set_sql} WHERE id = $1 RETURNING *",
        agreement_id,
        *values,
    )
    return dict(row)


@router.post("/agreements/{agreement_id}/supersede", status_code=201)
async def supersede_agreement(
    agreement_id: UUID,
    body: AgreementSupersede,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Two-step move: the predecessor flips to status='superseded' and
    a new draft is created with supersedes_id pointing back. Both steps
    happen in the same transaction (the route's get_conn dependency)
    so a partial failure rolls cleanly."""
    pred = await _agreement_or_404(conn, agreement_id)
    if pred["status"] in ("superseded", "expired", "terminated"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot supersede an agreement in status '{pred['status']}'.",
        )
    await _validate_document_for_agreement(conn, body.document_id)

    contract_number = None
    if pred["type"] == "services_contract":
        contract_number = await conn.fetchval("SELECT next_contract_number()")

    await conn.execute(
        "UPDATE agreements SET status = 'superseded' WHERE id = $1",
        agreement_id,
    )
    new_row = await conn.fetchrow(
        """
        INSERT INTO agreements (
          engagement_id, type, status, contract_number, amount,
          signed_at, effective_date, expires_at,
          document_id, notes, supersedes_id, created_by
        ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        """,
        pred["engagement_id"], pred["type"], contract_number, body.amount,
        body.signed_at, body.effective_date, body.expires_at,
        body.document_id, (body.notes or "").strip() or None,
        agreement_id, user["id"],
    )
    return dict(new_row)


@router.post("/agreements/{agreement_id}/mark-sent")
async def mark_agreement_sent(
    agreement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Stamp sent_at = NOW() while keeping status='draft'. The "sent"
    UI state is derived as (status='draft' AND sent_at IS NOT NULL).
    Idempotent — re-sending preserves the first sent_at via COALESCE;
    the UI can offer an explicit re-send affordance that PATCHes
    sent_at directly if it wants to overwrite."""
    row = await _agreement_or_404(conn, agreement_id)
    if row["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark-sent an agreement in status '{row['status']}'.",
        )
    updated = await conn.fetchrow(
        """
        UPDATE agreements
        SET sent_at = COALESCE(sent_at, NOW())
        WHERE id = $1
        RETURNING *
        """,
        agreement_id,
    )
    return dict(updated)


@router.post("/agreements/{agreement_id}/upload-signed", status_code=201)
async def upload_signed_agreement(
    agreement_id: UUID,
    file: UploadFile = File(...),
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Upload the signed PDF for this agreement. In one transaction:
    create a documents row (owner_type='agreement', owner_id=this
    agreement), link it via agreements.document_id, stamp signed_at,
    and flip status to 'active'. Requires the agreement to be in
    'draft' status (cannot re-sign a superseded/expired/terminated
    row; supersede first instead)."""
    row = await _agreement_or_404(conn, agreement_id)
    if row["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot upload signed copy for an agreement in status "
                f"'{row['status']}'; supersede it first."
            ),
        )
    doc = await store_uploaded_document(
        conn,
        owner_type="agreement",
        owner_id=agreement_id,
        kind="other",
        file=file,
        uploaded_by=user["id"],
    )
    updated = await conn.fetchrow(
        """
        UPDATE agreements
        SET document_id = $2,
            signed_at = COALESCE(signed_at, CURRENT_DATE),
            status = 'active'
        WHERE id = $1
        RETURNING *
        """,
        agreement_id, doc["id"],
    )
    return {"agreement": dict(updated), "document": doc}


# ---- Render context + PDF -------------------------------------------------

_VARIABLE_RE = re.compile(r"\{\{\s*([a-z][a-z0-9_]+)\s*\}\}")


def _compose_address(
    street1: str | None,
    street2: str | None,
    city: str | None,
    state: str | None,
    postal_code: str | None,
    country: str | None,
) -> str | None:
    """Render a multi-line address into a single comma-separated line
    that fits inline in the contract. None / empty parts are skipped
    so partial addresses don't render with double commas."""
    line1 = ", ".join(x for x in [street1, street2] if x)
    line2_parts = [x for x in [city, state] if x]
    line2 = ", ".join(line2_parts)
    if line2 and postal_code:
        line2 = f"{line2} {postal_code}"
    elif postal_code:
        line2 = postal_code
    parts = [line1, line2, country if country and country.upper() not in ("US", "USA") else None]
    composed = ", ".join(x for x in parts if x)
    return composed or None


async def _build_default_context(conn, agreement: dict) -> dict[str, str]:
    """Compute the standard variable defaults from engagement / family /
    student / consultant data + firm-wide org_settings. Operator-supplied
    values in agreement.variables override these at render time. Missing
    keys stay missing — render then leaves the {{placeholder}} text alone
    so the operator can see what's unfilled."""
    eng = await conn.fetchrow(
        """
        SELECT e.id, e.engagement_type, e.default_hourly_rate,
               e.start_date, e.student_id,
               f.household_name AS family_name,
               TRIM(BOTH ' ' FROM
                 COALESCE(u.first_name, '') ||
                 CASE WHEN u.last_name IS NOT NULL AND u.last_name <> ''
                      THEN ' ' || u.last_name ELSE '' END
               ) AS consultant_name,
               u.email AS consultant_email,
               u.phone AS consultant_phone,
               u.street1 AS consultant_street1,
               u.street2 AS consultant_street2,
               u.city    AS consultant_city,
               u.state   AS consultant_state,
               u.postal_code AS consultant_postal_code,
               u.country AS consultant_country
        FROM engagements e
        JOIN families f ON f.id = e.family_id
        LEFT JOIN people u ON u.id = e.lead_consultant_id
        WHERE e.id = $1
        """,
        agreement["engagement_id"],
    )
    student = None
    if eng and eng["student_id"]:
        student = await conn.fetchrow(
            """
            SELECT TRIM(BOTH ' ' FROM
                     COALESCE(p.first_name, '') ||
                     CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                          THEN ' ' || p.last_name ELSE '' END
                   ) AS name,
                   p.birthday
            FROM people p
            WHERE p.id = $1 AND p.kind = 'student'
            """,
            eng["student_id"],
        )
    org = await conn.fetchrow("SELECT * FROM org_settings WHERE id = 1")

    ctx: dict[str, str] = {}
    today = date.today().isoformat()

    # Consultant block (from the engagement's lead_consultant person row)
    if eng and eng["consultant_name"]:
        ctx["consultant_name"] = eng["consultant_name"]
    if eng and eng["consultant_email"]:
        ctx["consultant_email"] = eng["consultant_email"]
    if eng and eng["consultant_phone"]:
        ctx["consultant_phone"] = eng["consultant_phone"]
    if eng:
        consultant_addr = _compose_address(
            eng["consultant_street1"], eng["consultant_street2"],
            eng["consultant_city"], eng["consultant_state"],
            eng["consultant_postal_code"], eng["consultant_country"],
        )
        if consultant_addr:
            ctx["consultant_address"] = consultant_addr

    # Client / family
    if eng and eng["family_name"]:
        ctx["client_name"] = f"the {eng['family_name']} family"

    # Money / dates
    if eng and eng["default_hourly_rate"] is not None:
        ctx["hourly_rate"] = str(eng["default_hourly_rate"])
    ctx["effective_date"] = (
        agreement.get("signed_at") or agreement.get("effective_date") or today
    )
    if isinstance(ctx["effective_date"], date):
        ctx["effective_date"] = ctx["effective_date"].isoformat()

    # Student / patient
    if student:
        if student["name"]:
            ctx["patient_full_name"] = student["name"]
        if student["birthday"]:
            ctx["patient_dob"] = student["birthday"].isoformat()

    # Firm-wide constants (lowest priority — user/engagement values
    # already set above take precedence via the {**defaults, **overrides}
    # merge in the PDF endpoint, but within defaults we let real
    # consultant-row values override org-level fallbacks).
    if org:
        firm_addr = _compose_address(
            org["firm_street1"], org["firm_street2"],
            org["firm_city"], org["firm_state"],
            org["firm_postal_code"], org["firm_country"],
        )
        # consultant_address falls back to firm address if the
        # consultant didn't fill in their own.
        if firm_addr and "consultant_address" not in ctx:
            ctx["consultant_address"] = firm_addr
        if org["governing_state"]:
            ctx["governing_state"] = org["governing_state"]
        if org["billing_increment_minutes"] is not None:
            ctx["billing_increment_minutes"] = str(org["billing_increment_minutes"])
        if org["invoice_frequency"]:
            ctx["invoice_frequency"] = org["invoice_frequency"]
        if org["payment_terms_days"] is not None:
            ctx["payment_terms_days"] = str(org["payment_terms_days"])
        if org["expense_approval_threshold"] is not None:
            ctx["expense_approval_threshold"] = str(org["expense_approval_threshold"])
    return ctx


def _substitute(body: str, ctx: dict[str, Any]) -> str:
    """Replace {{var}} with ctx[var] string. Unknown variables stay
    as {{var}} so the rendered PDF makes them visible — easier to spot
    what's not filled than a silent blank."""

    def _repl(m: re.Match[str]) -> str:
        key = m.group(1)
        val = ctx.get(key)
        return str(val) if val not in (None, "") else m.group(0)

    return _VARIABLE_RE.sub(_repl, body or "")


def _markdown_to_html(body: str) -> str:
    """Light markdown → HTML wrapped in a print-friendly stylesheet for
    WeasyPrint. The stylesheet is intentionally narrow (just typography
    + page margins) so the agreement looks like a legal document."""
    from markdown import markdown  # noqa: PLC0415

    body_html = markdown(
        body or "",
        extensions=["extra", "sane_lists"],
        output_format="html5",
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Agreement</title>
<style>
  @page {{ size: Letter; margin: 0.75in; }}
  body {{
    font-family: "Georgia", "Times New Roman", serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #111;
  }}
  h1, h2, h3 {{ font-family: "Helvetica Neue", "Arial", sans-serif; }}
  h1 {{ font-size: 14pt; margin-top: 1.4em; }}
  h2 {{ font-size: 12pt; margin-top: 1em; }}
  h3 {{ font-size: 11pt; margin-top: 0.8em; }}
  hr {{ border: none; border-top: 1px solid #999; margin: 1.5em 0; }}
  ul, ol {{ padding-left: 1.4em; }}
  li {{ margin-bottom: 0.15em; }}
  strong {{ font-weight: 700; }}
  code {{ font-family: monospace; }}
</style>
</head>
<body>
{body_html}
</body>
</html>"""


@router.get("/agreements/{agreement_id}/pdf")
async def render_agreement_pdf(
    agreement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Render the agreement's body_markdown to PDF. Variables are
    substituted from defaults (computed from engagement context) merged
    with the agreement's operator-supplied overrides. Unknown variables
    stay visible in the output so the operator can spot fillins they
    forgot. Streamed inline so a browser tab opens the PDF directly."""
    agreement = await _agreement_or_404(conn, agreement_id)
    body = agreement.get("body_markdown")
    if not body:
        raise HTTPException(
            status_code=400,
            detail=(
                "Agreement has no body_markdown to render. "
                "Pick a template when creating the agreement, or paste "
                "markdown via the View / Edit dialog."
            ),
        )

    defaults = await _build_default_context(conn, dict(agreement))
    overrides = agreement.get("variables") or {}
    if isinstance(overrides, str):
        overrides = json.loads(overrides) if overrides else {}
    ctx = {**defaults, **overrides}

    rendered_md = _substitute(body, ctx)
    html = _markdown_to_html(rendered_md)

    from weasyprint import HTML  # noqa: PLC0415

    from ..pdf import safe_url_fetcher  # noqa: PLC0415

    pdf_bytes = HTML(string=html, url_fetcher=safe_url_fetcher).write_pdf()
    filename = agreement.get("contract_number") or f"agreement-{str(agreement_id)[:8]}"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}.pdf"',
        },
    )


@router.delete("/agreements/{agreement_id}", status_code=204)
async def delete_agreement(
    agreement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Hard delete is only permitted for draft agreements that aren't
    part of a supersession chain — anything signed has financial /
    legal weight and must use status transitions instead."""
    pred = await _agreement_or_404(conn, agreement_id)
    if pred["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail="Only draft agreements can be deleted; use status='terminated' otherwise.",
        )
    referenced = await conn.fetchval(
        "SELECT 1 FROM agreements WHERE supersedes_id = $1",
        agreement_id,
    )
    if referenced:
        raise HTTPException(
            status_code=400,
            detail="Another agreement supersedes this one; deletion would orphan the chain.",
        )
    await conn.execute("DELETE FROM agreements WHERE id = $1", agreement_id)
    return None
