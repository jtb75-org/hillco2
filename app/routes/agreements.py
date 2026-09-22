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

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn
from .documents import store_uploaded_document

router = APIRouter(prefix="/api", tags=["agreements"])


# medical_release is retired (template deactivated in 0041) but stays valid
# for the releases signed before that.
AgreementType = Literal["services_contract", "records_request", "medical_release"]
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
    # Initial variable overrides supplied at create time (e.g. the
    # dialog's inline variable form). Merged on top of auto-fill
    # defaults at render time, same as PATCH-set variables.
    variables: dict[str, Any] | None = None


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

async def _engagement_or_404(conn, engagement_id: UUID):
    row = await conn.fetchrow(
        """
        SELECT id, billing_mode, fixed_fee
        FROM engagements WHERE id = $1 AND deleted_at IS NULL
        """,
        engagement_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return row


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
               a.auto_send_records_request,
               a.created_by, a.created_at, a.updated_at,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS created_by_name,
               (SELECT count(*) FROM agreement_emails e WHERE e.agreement_id = a.id) AS send_count,
               (SELECT max(e.sent_at) FROM agreement_emails e WHERE e.agreement_id = a.id) AS last_sent_at
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
    eng = await _engagement_or_404(conn, engagement_id)
    await _validate_document_for_agreement(conn, body.document_id)

    contract_number = None
    if body.type == "services_contract":
        contract_number = await conn.fetchval("SELECT next_contract_number()")

    # Fixed-bid services contract: the fee is the engagement's fixed_fee
    # unless the operator overrides `amount`. Once this agreement is active,
    # its amount is the canonical signed figure (a later engagement-fee edit
    # won't rewrite it). Block creation if the engagement has no fee yet.
    amount = body.amount
    if body.type == "services_contract" and eng["billing_mode"] == "fixed":
        if amount is None:
            amount = eng["fixed_fee"]
        if amount is None:
            raise HTTPException(
                status_code=400,
                detail="Set the engagement's fixed fee before creating a fixed-fee contract.",
            )

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

    # Freeze the scope-of-services list (the engagement's activities) onto the
    # agreement so a signed contract's scope never drifts if activities change
    # later. Operator-supplied variables win. Only services contracts carry it.
    variables = dict(body.variables or {})
    if body.type == "services_contract":
        variables.setdefault(
            "scope_of_services", await _build_scope_markdown(conn, engagement_id)
        )

    row = await conn.fetchrow(
        """
        INSERT INTO agreements (
          engagement_id, type, status, contract_number, amount,
          signed_at, effective_date, expires_at,
          document_id, notes, created_by,
          template_id, body_markdown, variables
        ) VALUES (
          $1, $2::agreement_type, 'draft', $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13::jsonb
        )
        RETURNING *
        """,
        engagement_id, body.type, contract_number, amount,
        body.signed_at, body.effective_date, body.expires_at,
        body.document_id, (body.notes or "").strip() or None, user["id"],
        body.template_id, body_markdown,
        json.dumps(variables),
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
    # Carry the contract itself forward — a supersede should clone the
    # predecessor's snapshotted body + variable overrides + template link
    # so the new draft opens as an editable copy, not a blank document.
    # variables is jsonb (no asyncpg codec → comes back as a JSON string);
    # normalize to a dict, then re-dump for the ::jsonb insert.
    pred_vars = pred["variables"]
    if isinstance(pred_vars, str):
        pred_vars = json.loads(pred_vars) if pred_vars else {}
    new_row = await conn.fetchrow(
        """
        INSERT INTO agreements (
          engagement_id, type, status, contract_number, amount,
          signed_at, effective_date, expires_at,
          document_id, notes, supersedes_id, created_by,
          template_id, body_markdown, variables
        ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11,
                  $12, $13, $14::jsonb)
        RETURNING *
        """,
        pred["engagement_id"], pred["type"], contract_number, body.amount,
        body.signed_at, body.effective_date, body.expires_at,
        body.document_id, (body.notes or "").strip() or None,
        agreement_id, user["id"],
        pred["template_id"], pred["body_markdown"], json.dumps(pred_vars or {}),
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


async def _billing_recipient(conn, engagement_id: UUID) -> str | None:
    """The family's billing contact email, falling back to primary, then any
    guardian with an email — same precedence as invoice send."""
    return await conn.fetchval(
        """
        SELECT p.email
        FROM engagements e
        JOIN family_guardians fg ON fg.family_id = e.family_id
        JOIN people p ON p.id = fg.person_id AND p.deleted_at IS NULL
        WHERE e.id = $1 AND p.email IS NOT NULL AND p.email <> ''
        ORDER BY fg.is_billing_contact DESC, fg.is_primary_contact DESC,
                 p.last_name NULLS LAST, p.first_name
        LIMIT 1
        """,
        engagement_id,
    )


def _public_base_url(request) -> str:
    from ..config import settings  # noqa: PLC0415

    base = settings.public_base_url or str(request.base_url)
    return base.rstrip("/")


class SendForSignatureBody(BaseModel):
    # Operator's answer to "email the Records Request automatically once the
    # client signs?" — acted on by the signing route.
    auto_send_records_request: bool = False


@router.post("/agreements/{agreement_id}/send-for-signature")
async def send_agreement_for_signature(
    agreement_id: UUID,
    request: Request,
    body: SendForSignatureBody | None = None,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Email the client a tokenized link to review and e-sign the agreement.

    Rotates the signing nonce (so any previously sent link is invalidated),
    stamps sent_at / signing_sent_at, and keeps status='draft' until the
    client actually signs. Only draft agreements can be sent."""
    from ..email import (  # noqa: PLC0415
        EmailSendError,
        render_letterhead_email,
        send_email,
    )
    from ..signing import make_signing_token  # noqa: PLC0415

    row = await _agreement_or_404(conn, agreement_id)
    if row["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot send for signature an agreement in status '{row['status']}'.",
        )
    if not row.get("body_markdown"):
        raise HTTPException(
            status_code=400,
            detail="Agreement has no contract body to sign. Pick a template first.",
        )
    recipient = await _billing_recipient(conn, row["engagement_id"])
    if not recipient:
        raise HTTPException(
            status_code=400,
            detail=(
                "No client email on file. Add an email to the family's billing "
                "or primary contact, then send again."
            ),
        )

    updated = await conn.fetchrow(
        """
        UPDATE agreements
        SET signing_nonce = gen_random_uuid(),
            signing_sent_at = NOW(),
            sent_at = NOW(),
            auto_send_records_request = $2
        WHERE id = $1
        RETURNING *
        """,
        agreement_id,
        bool(body.auto_send_records_request) if body else False,
    )
    token = make_signing_token(agreement_id, updated["signing_nonce"])
    link = f"{_public_base_url(request)}/sign/{token}"
    contract_no = updated.get("contract_number") or "your agreement"

    try:
        send_email(
            to=recipient,
            subject=f"Please review and sign {contract_no}",
            body_text=(
                "Hello,\n\n"
                f"Your educational consulting services agreement ({contract_no}) "
                "is ready for your review and electronic signature. Open the secure "
                "link below to review and sign:\n\n"
                f"{link}\n\n"
                "This link is unique to you and expires in 30 days. If you'd prefer "
                "to sign on paper instead, just reply to this email.\n\n"
                "— HillCo Educational Consulting"
            ),
            body_html=render_letterhead_email(
                heading="Your agreement is ready to sign",
                paragraphs=[
                    f"Your educational consulting services agreement ({contract_no}) "
                    "is ready for your review and electronic signature.",
                    "Click the button below to open the secure signing page, review "
                    "the agreement, and sign online.",
                ],
                button=("Review & sign your agreement", link),
                footer_note=(
                    "This link is unique to you and expires in 30 days. If you'd "
                    "prefer to sign on paper instead, just reply to this email."
                ),
            ),
        )
    except EmailSendError as exc:
        raise HTTPException(
            status_code=502, detail="Could not send the signing email; try again."
        ) from exc

    return {"sent_to": recipient, "signing_sent_at": updated["signing_sent_at"]}


# ---- Records request ---------------------------------------------------------
#
# Sent to the family once the services contract is signed: a letter +
# checklist PDF of the records to gather. Never signed; can be re-sent, and
# every send is logged in agreement_emails.

async def ensure_records_request(conn, engagement_id: UUID, *, created_by) -> dict:
    """The engagement's current Records Request agreement, creating a draft
    from the active template if there isn't one yet."""
    existing = await conn.fetchrow(
        """
        SELECT * FROM agreements
        WHERE engagement_id = $1 AND type = 'records_request'
          AND status IN ('draft', 'active')
        ORDER BY created_at DESC LIMIT 1
        """,
        engagement_id,
    )
    if existing:
        return dict(existing)
    tpl = await conn.fetchrow(
        """
        SELECT id, body_markdown FROM contract_templates
        WHERE kind = 'records_request' AND is_active AND deleted_at IS NULL
        ORDER BY sort_order, created_at LIMIT 1
        """
    )
    if tpl is None:
        raise HTTPException(
            status_code=400,
            detail="No active Records Request template. Add one under Catalog → Templates.",
        )
    row = await conn.fetchrow(
        """
        INSERT INTO agreements (engagement_id, type, status, created_by,
                                template_id, body_markdown, variables)
        VALUES ($1, 'records_request', 'draft', $2, $3, $4, '{}'::jsonb)
        RETURNING *
        """,
        engagement_id, created_by, tpl["id"], tpl["body_markdown"],
    )
    return dict(row)


async def send_records_request(conn, agreement: dict, *, sent_by) -> dict:
    """Render the Records Request to PDF, email it to the family's billing
    contact, log the send, and stamp sent_at (first send only)."""
    from ..email import (  # noqa: PLC0415
        EmailSendError,
        render_letterhead_email,
        send_email,
    )

    if agreement["type"] != "records_request":
        raise HTTPException(status_code=400, detail="Only a Records Request can be sent this way.")
    if not agreement.get("body_markdown"):
        raise HTTPException(status_code=400, detail="The Records Request has no body. Pick a template first.")
    recipient = await _billing_recipient(conn, agreement["engagement_id"])
    if not recipient:
        raise HTTPException(
            status_code=400,
            detail=(
                "No client email on file. Add an email to the family's billing "
                "or primary contact, then send again."
            ),
        )

    rendered_md = await render_agreement_markdown(conn, dict(agreement))
    pdf = agreement_pdf_bytes(rendered_md)
    subject = "Records request from HillCo Educational Consulting"
    body_text = (
        "Hello,\n\n"
        "Now that your services agreement is in place, the attached letter lists "
        "the records that will help me get started. Please gather whichever you "
        "have and reply to this email with them attached — copies, photos, or "
        "scans are all fine.\n\n"
        "— HillCo Educational Consulting"
    )
    body_html = render_letterhead_email(
        heading="Records to gather for our work together",
        paragraphs=[
            "Now that your services agreement is in place, the attached letter "
            "lists the records that will help me get started.",
            "Please gather whichever you have and reply to this email with them "
            "attached — copies, photos, or scans are all fine.",
        ],
        footer_note="The records request is attached as a PDF.",
    )
    try:
        message_id = send_email(
            to=recipient,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            attachments=[("records-request.pdf", "pdf", pdf)],
        )
    except EmailSendError as exc:
        raise HTTPException(
            status_code=502, detail="Could not send the records request email; try again."
        ) from exc

    await conn.execute(
        """
        INSERT INTO agreement_emails
            (agreement_id, purpose, to_address, subject, body, sent_by, smtp_message_id)
        VALUES ($1, 'records_request', $2, $3, $4, $5, $6)
        """,
        agreement["id"], recipient, subject, body_text, sent_by, message_id or None,
    )
    await conn.execute(
        "UPDATE agreements SET sent_at = COALESCE(sent_at, NOW()) WHERE id = $1",
        agreement["id"],
    )
    return {"agreement_id": str(agreement["id"]), "sent_to": recipient}


@router.post("/engagements/{engagement_id}/records-request/send")
async def send_engagement_records_request(
    engagement_id: UUID,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Send (or re-send) the engagement's Records Request, creating it from
    the active template on first use. The Contracts card's one-click
    "Send records request" / "Resend"."""
    await _engagement_or_404(conn, engagement_id)
    rr = await ensure_records_request(conn, engagement_id, created_by=user["id"])
    return await send_records_request(conn, rr, sent_by=user["id"])


@router.post("/agreements/{agreement_id}/send")
async def send_agreement(
    agreement_id: UUID,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Email a Records Request that already exists (e.g. one drafted and
    edited via New agreement) — send or re-send."""
    row = await _agreement_or_404(conn, agreement_id)
    return await send_records_request(conn, dict(row), sent_by=user["id"])


@router.get("/agreements/{agreement_id}/emails")
async def list_agreement_emails(
    agreement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Every email sent for this agreement, newest first — the Records
    Request's send history."""
    await _agreement_or_404(conn, agreement_id)
    rows = await conn.fetch(
        """
        SELECT e.id, e.purpose, e.to_address, e.cc_addresses, e.subject,
               e.sent_at, e.smtp_message_id,
               TRIM(BOTH ' ' FROM COALESCE(p.first_name, '') ||
                 CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                      THEN ' ' || p.last_name ELSE '' END
               ) AS sent_by_name
        FROM agreement_emails e
        LEFT JOIN people p ON p.id = e.sent_by
        WHERE e.agreement_id = $1
        ORDER BY e.sent_at DESC
        """,
        agreement_id,
    )
    return [dict(r) for r in rows]


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


def _street_line(street1: str | None, street2: str | None) -> str | None:
    """Just the street portion of an address (for templates that put
    city/state/zip on their own line)."""
    line = ", ".join(x for x in [street1, street2] if x and x.strip())
    return line or None


def _city_state_zip(city: str | None, state: str | None, postal: str | None) -> str | None:
    """'City, State ZIP' with graceful handling of missing parts."""
    left = ", ".join(x for x in [city, state] if x and x.strip())
    if left and postal:
        return f"{left} {postal}"
    return left or (postal or None)


async def _primary_guardian(conn, family_id) -> dict | None:
    """The family's billing-flagged guardian (falling back to primary, then
    any), with the fields the medical-release template needs. Address prefers
    the person's billing_* block, falling back to their mailing address."""
    if family_id is None:
        return None
    row = await conn.fetchrow(
        """
        SELECT p.first_name, p.last_name, p.phone, fg.relationship,
               p.street1, p.street2, p.city, p.state, p.postal_code,
               p.billing_street1, p.billing_street2, p.billing_city,
               p.billing_state, p.billing_postal_code
        FROM family_guardians fg
        JOIN people p ON p.id = fg.person_id AND p.deleted_at IS NULL
        WHERE fg.family_id = $1
        ORDER BY fg.is_billing_contact DESC, fg.is_primary_contact DESC,
                 p.last_name NULLS LAST, p.first_name
        LIMIT 1
        """,
        family_id,
    )
    if row is None:
        return None
    use_billing = bool(row["billing_street1"] or row["billing_city"])
    if use_billing:
        street = _street_line(row["billing_street1"], row["billing_street2"])
        csz = _city_state_zip(row["billing_city"], row["billing_state"], row["billing_postal_code"])
    else:
        street = _street_line(row["street1"], row["street2"])
        csz = _city_state_zip(row["city"], row["state"], row["postal_code"])
    name = " ".join(x for x in [row["first_name"], row["last_name"]] if x and x.strip()).strip()
    return {
        "name": name or None,
        "phone": row["phone"],
        "relationship": row["relationship"],
        "street": street,
        "city_state_zip": csz,
    }


async def _client_address_for_family(conn, family_id: UUID) -> str | None:
    """Compose {{client_address}} from the family's billing-flagged
    guardian, falling back to the primary-flagged guardian, then any
    guardian. For each, prefer their billing_* address columns over
    the home/mailing ones — billing_* is the per-person override
    specifically intended for billing correspondence."""
    if family_id is None:
        return None
    row = await conn.fetchrow(
        """
        SELECT
          p.street1, p.street2, p.city, p.state, p.postal_code, p.country,
          p.billing_street1, p.billing_street2, p.billing_city,
          p.billing_state, p.billing_postal_code, p.billing_country
        FROM family_guardians fg
        JOIN people p ON p.id = fg.person_id AND p.deleted_at IS NULL
        WHERE fg.family_id = $1
        ORDER BY
          fg.is_billing_contact DESC,
          fg.is_primary_contact DESC,
          p.last_name NULLS LAST, p.first_name
        LIMIT 1
        """,
        family_id,
    )
    if row is None:
        return None
    # Try billing_* first, then mailing fields. We don't mix-and-match
    # (e.g., billing street + mailing zip) — pick whichever block has
    # actual content.
    billing = _compose_address(
        row["billing_street1"], row["billing_street2"], row["billing_city"],
        row["billing_state"], row["billing_postal_code"], row["billing_country"],
    )
    if billing:
        return billing
    return _compose_address(
        row["street1"], row["street2"], row["city"],
        row["state"], row["postal_code"], row["country"],
    )


async def _build_default_context(conn, agreement: dict) -> dict[str, str]:
    """Compute the standard variable defaults from engagement / family /
    student / consultant data + firm-wide org_settings. Operator-supplied
    values in agreement.variables override these at render time. Missing
    keys stay missing — render then leaves the {{placeholder}} text alone
    so the operator can see what's unfilled."""
    eng = await conn.fetchrow(
        """
        SELECT e.id, e.engagement_type, e.default_hourly_rate,
               e.billing_mode, e.fixed_fee,
               e.start_date, e.student_id, e.family_id,
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

    # Client / family. Household names often already end in "Family"
    # (e.g. "Rivera Family"), so only append "family" when they don't —
    # avoids "the Rivera Family family".
    if eng and eng["family_name"]:
        name = eng["family_name"].strip()
        suffix = "" if name.lower().endswith("family") else " family"
        ctx["client_name"] = f"the {name}{suffix}"
    if eng and eng["family_id"]:
        client_addr = await _client_address_for_family(conn, eng["family_id"])
        if client_addr:
            ctx["client_address"] = client_addr

    # Parent/guardian block for the medical-records release: pull the patient's
    # address/phone and the guardian's name + relationship from the family's
    # billing/primary guardian (the minor patient shares the household address).
    if eng and eng["family_id"]:
        guardian = await _primary_guardian(conn, eng["family_id"])
        if guardian:
            if guardian["name"]:
                ctx["parent_guardian_name"] = guardian["name"]
            if guardian["relationship"]:
                ctx["parent_guardian_relationship"] = guardian["relationship"]
            if guardian["street"]:
                ctx["patient_address"] = guardian["street"]
            if guardian["city_state_zip"]:
                ctx["patient_city_state_zip"] = guardian["city_state_zip"]
            if guardian["phone"]:
                ctx["patient_phone"] = guardian["phone"]

    # Money / dates
    if eng and eng["default_hourly_rate"] is not None:
        ctx["hourly_rate"] = str(eng["default_hourly_rate"])
    # Fixed fee: the signed agreement amount is canonical; fall back to the
    # engagement's fixed_fee (the quote) for a not-yet-priced draft.
    fixed_fee = agreement.get("amount")
    if fixed_fee is None and eng is not None:
        fixed_fee = eng["fixed_fee"]
    if fixed_fee is not None:
        ctx["fixed_fee"] = str(fixed_fee)
        # The fixed-fee contract's §4.2 bills two 50% installments; computed
        # here so the template stays correct for any fee, not just one quote.
        ctx["fixed_fee_half"] = str((Decimal(fixed_fee) / 2).quantize(Decimal("0.01")))
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
        # Medical-release "Company/Organization" line.
        if org["firm_name"]:
            ctx["consultant_company"] = org["firm_name"]
        # consultant_phone falls back to the firm phone when the lead
        # consultant's own phone is unset.
        if org["firm_phone"] and "consultant_phone" not in ctx:
            ctx["consultant_phone"] = org["firm_phone"]
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

    # Scope of services: the engagement's activity list, grouped by phase.
    # Frozen onto the agreement's variables at creation; recomputed here so
    # the pre-creation preview shows it filled.
    if eng:
        ctx["scope_of_services"] = await _build_scope_markdown(conn, eng["id"])
    return ctx


async def _build_scope_markdown(conn, engagement_id) -> str:
    """Render the engagement's activities as a phase-grouped markdown list
    for the contract's Scope of Services section."""
    rows = await conn.fetch(
        """
        SELECT t.title, t.description,
               COALESCE(cp.title, 'Other') AS phase_title,
               COALESCE(cp.sort_order, 999999) AS phase_sort
        FROM engagement_tasks t
        LEFT JOIN catalog_phases cp ON cp.id = t.phase_id
        WHERE t.engagement_id = $1
        ORDER BY phase_sort, phase_title, t.sort_order, t.title
        """,
        engagement_id,
    )
    if not rows:
        return "_No activities have been added to this engagement yet._"
    lines: list[str] = []
    current = None
    for r in rows:
        if r["phase_title"] != current:
            current = r["phase_title"]
            lines.append(f"\n**{current}**\n")
        desc = (r["description"] or "").strip()
        lines.append(f"- **{r['title']}**" + (f" — {desc}" if desc else ""))
    return "\n".join(lines).strip()


async def build_render_context(
    conn,
    engagement_id: UUID,
    *,
    signed_at: Any = None,
    effective_date: Any = None,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Public wrapper around _build_default_context for callers that
    don't have a fully-formed agreement row (e.g. the template
    render-context preview that runs BEFORE the agreement exists).
    Merges operator-supplied overrides on top so the same code path
    drives both the PDF endpoint and the New Agreement dialog's
    'what's still missing' computation."""
    stub = {
        "engagement_id": engagement_id,
        "signed_at": signed_at,
        "effective_date": effective_date,
    }
    defaults = await _build_default_context(conn, stub)
    if overrides:
        return {**defaults, **overrides}
    return defaults


def _substitute(body: str, ctx: dict[str, Any]) -> str:
    """Replace {{var}} with ctx[var]. An unfilled variable renders as a blank
    fill-in line (not the raw {{var}}) so drafts look like proper forms — the
    New Agreement dialog's variable checklist is what surfaces unfilled fields
    to the operator, not the PDF."""

    def _repl(m: re.Match[str]) -> str:
        val = ctx.get(m.group(1))
        return str(val) if val not in (None, "") else "__________"

    return _VARIABLE_RE.sub(_repl, body or "")


def _markdown_to_html(
    body: str,
    *,
    extra_html: str = "",
    contract_number: str | None = None,
    firm_name: str = "HillCo Educational Consulting",
) -> str:
    """Markdown → branded, print-ready HTML for WeasyPrint. Adds a running
    HillCo letterhead header + footer (page numbers) and the brand palette.

    `extra_html` is appended after the rendered body — used to bolt the
    signature-certificate page onto a signed copy."""
    from html import escape  # noqa: PLC0415

    from markdown import markdown  # noqa: PLC0415

    body_html = markdown(
        body or "",
        extensions=["extra", "sane_lists"],
        output_format="html5",
    )
    header_right = escape(contract_number) if contract_number else ""
    footer_left = escape(firm_name)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Agreement</title>
<style>
  /* Contract typography: one serif family at document scale, justified,
     compact numbered headings, no rules between sections. The templates'
     `---` separators are hidden — the numbered headings carry the structure,
     and each rule used to cost ~50pt of white space with its margins. */
  @page {{
    size: Letter;
    margin: 1in 0.9in 0.9in 0.9in;
    @top-center {{ content: element(docHeader); vertical-align: bottom; }}
    @bottom-left {{
      content: "{footer_left}";
      font-family: "Helvetica Neue", "Arial", sans-serif;
      font-size: 7.5pt; color: #9aa3b2;
    }}
    @bottom-right {{
      content: "Page " counter(page) " of " counter(pages);
      font-family: "Helvetica Neue", "Arial", sans-serif;
      font-size: 7.5pt; color: #9aa3b2;
    }}
  }}
  /* Running letterhead — repeats on every page via @top-center. */
  .doc-header {{
    position: running(docHeader);
    width: 6.7in;  /* Letter (8.5in) minus 0.9in side margins → full content width */
    border-bottom: 1.5px solid #08428d;
    padding-bottom: 4pt;
  }}
  .doc-header table {{ width: 100%; border-collapse: collapse; }}
  .doc-header td {{ vertical-align: bottom; }}
  .doc-header .wm {{ font-family: "Helvetica Neue", "Arial", sans-serif; }}
  .doc-header .wm-name {{ font-size: 14pt; font-weight: 800; letter-spacing: .5px; }}
  .doc-header .wm-name .hill {{ color: #08428d; }}
  .doc-header .wm-name .co {{ color: #5fa0ee; }}
  .doc-header .wm-sub {{
    font-size: 6.5pt; font-weight: 400; letter-spacing: 2.5px; color: #6b7280;
    display: block; margin-top: 1pt;
  }}
  .doc-header .doc-ref {{
    font-family: "Helvetica Neue", "Arial", sans-serif;
    font-size: 8.5pt; color: #6b7280; text-align: right;
  }}
  body {{
    font-family: "Georgia", "Times New Roman", serif;
    font-size: 10.5pt;
    line-height: 1.38;
    color: #111827;
    text-align: justify;
    hyphens: none;  /* legal text doesn't break names ("Mis-souri") */
  }}
  p {{ margin: 0 0 6pt; orphans: 3; widows: 3; }}
  h1, h2, h3 {{
    font-family: "Georgia", "Times New Roman", serif;
    color: #08428d;
    text-align: left;
    break-after: avoid; page-break-after: avoid;
  }}
  /* The document title is the first heading; every later h1 is a numbered
     section ("3. TERM AND TERMINATION") and sits at body scale. */
  body > h1:first-of-type {{
    font-size: 13.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: .8px; text-align: center; margin: 0 0 14pt;
  }}
  h1 {{
    font-size: 10.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: .4px; margin: 13pt 0 4pt;
  }}
  h2 {{ font-size: 10.5pt; font-weight: 700; margin: 9pt 0 3pt; color: #073a7b; }}
  h3 {{ font-size: 10.5pt; font-weight: 700; font-style: italic; margin: 8pt 0 2pt; color: #1f2937; }}
  hr {{ display: none; }}
  ul, ol {{ margin: 2pt 0 6pt; padding-left: 1.5em; }}
  li {{ margin-bottom: 2pt; }}
  li p {{ margin: 0; }}
  strong {{ font-weight: 700; }}
  code {{ font-family: monospace; }}
  .sig-cert {{ page-break-before: always; text-align: left; }}
  .sig-cert h2 {{ font-size: 12pt; border-bottom: 1.5px solid #08428d; padding-bottom: 4pt; margin: 0 0 8pt; }}
  .sig-block {{ margin: 10pt 0; padding: 8pt 12pt; border: 1px solid #dbe4f3; border-radius: 3pt; }}
  .sig-block .sig-name {{ font-size: 20pt; font-family: "Segoe Script", "Snell Roundhand", cursive; color: #08428d; }}
  .sig-block img.sig-img {{ max-height: 80px; }}
  .sig-meta {{ font-family: "Helvetica Neue", "Arial", sans-serif; font-size: 8.5pt; color: #444; border-collapse: collapse; margin-top: 6pt; }}
  .sig-meta th {{ text-align: left; vertical-align: top; font-weight: 600; width: 110px; padding: 1pt 10pt 1pt 0; white-space: nowrap; }}
  .sig-meta td {{ vertical-align: top; word-break: break-all; padding: 1pt 0; }}
</style>
</head>
<body>
<div class="doc-header">
  <table><tr>
    <td class="wm">
      <span class="wm-name"><span class="hill">HILL</span><span class="co">CO</span></span>
      <span class="wm-sub">EDUCATIONAL CONSULTING</span>
    </td>
    <td class="doc-ref">{header_right}</td>
  </tr></table>
</div>
{body_html}
{extra_html}
</body>
</html>"""


ESIGN_CUT_MARKER = "<!-- esign-cut -->"


def strip_wet_signatures(md: str) -> str:
    """Drop the template's wet-ink signature block (everything from the
    <!-- esign-cut --> marker) for an e-signed copy, which carries the
    Signature Certificate page instead. No marker → returned unchanged."""
    if not md or ESIGN_CUT_MARKER not in md:
        return md
    return md.split(ESIGN_CUT_MARKER, 1)[0].rstrip() + "\n"


def markdown_to_fragment(md: str) -> str:
    """Render markdown to an HTML fragment (no page wrapper) for on-screen
    display of the contract on the public signing page."""
    from markdown import markdown  # noqa: PLC0415

    return markdown(md or "", extensions=["extra", "sane_lists"], output_format="html5")


async def render_agreement_markdown(conn, agreement: dict) -> str:
    """Substitute an agreement's variables into its body_markdown, using the
    engagement-derived defaults merged under the operator's overrides."""
    body = agreement.get("body_markdown") or ""
    defaults = await _build_default_context(conn, dict(agreement))
    overrides = agreement.get("variables") or {}
    if isinstance(overrides, str):
        overrides = json.loads(overrides) if overrides else {}
    ctx = {**defaults, **overrides}
    return _substitute(body, ctx)


def agreement_pdf_bytes(
    rendered_md: str,
    *,
    extra_html: str = "",
    contract_number: str | None = None,
) -> bytes:
    """Render already-substituted markdown to branded PDF bytes."""
    from weasyprint import HTML  # noqa: PLC0415

    from ..pdf import safe_url_fetcher  # noqa: PLC0415

    html = _markdown_to_html(
        rendered_md, extra_html=extra_html, contract_number=contract_number
    )
    return HTML(string=html, url_fetcher=safe_url_fetcher()).write_pdf()


def _esc(value: Any) -> str:
    """Minimal HTML escaping for values interpolated into the certificate."""
    from html import escape  # noqa: PLC0415

    return escape("" if value is None else str(value))


def signature_certificate_html(signatures: list[dict]) -> str:
    """Build the ESIGN/UETA audit page appended to a signed contract PDF.

    Each `signatures` entry is a dict with: signer_role, signer_name,
    signer_email, method, signature_text or signature_data_uri, signed_at
    (datetime), ip_address, user_agent, document_sha256, consent_text.
    """
    if not signatures:
        return ""
    blocks: list[str] = []
    for s in signatures:
        if s.get("method") == "drawn" and s.get("signature_data_uri"):
            mark = f'<img class="sig-img" src="{_esc(s["signature_data_uri"])}" alt="signature">'
        else:
            mark = f'<div class="sig-name">{_esc(s.get("signature_text") or s.get("signer_name"))}</div>'
        signed_at = s.get("signed_at")
        signed_str = (
            signed_at.strftime("%Y-%m-%d %H:%M:%S UTC")
            if isinstance(signed_at, datetime)
            else _esc(signed_at)
        )
        role = "Firm" if s.get("signer_role") == "firm" else "Client"
        signer = _esc(s.get("signer_name"))
        if s.get("signer_email"):
            signer += " &lt;" + _esc(s.get("signer_email")) + "&gt;"
        # (label, value) — rows with an empty value are dropped so a firm
        # signature (no IP / device) doesn't leave misaligned blank rows.
        meta = [
            ("Signer", signer),
            ("Method", f"Electronic ({_esc(s.get('method'))})"),
            ("Signed at", signed_str),
            ("IP address", _esc(s["ip_address"]) if s.get("ip_address") else ""),
            ("Device", _esc(s["user_agent"]) if s.get("user_agent") else ""),
            ("Document hash", f"SHA-256 {_esc(s.get('document_sha256'))}"),
        ]
        rows = "".join(
            f"<tr><th>{label}</th><td>{value}</td></tr>" for label, value in meta if value
        )
        blocks.append(
            f"""
    <div class="sig-block">
      <div style="font-size:9pt;text-transform:uppercase;letter-spacing:.08em;color:#666;">{role} signature</div>
      {mark}
      <table class="sig-meta">{rows}</table>
    </div>"""
        )
    consent = _esc(
        signatures[0].get("consent_text")
        or "The parties consented to sign this agreement electronically."
    )
    return f"""
  <section class="sig-cert">
    <h2>Signature Certificate</h2>
    <p style="font-size:9.5pt;color:#333;">
      This agreement was executed electronically. Each signature below was
      captured with the signer's name, timestamp, network address, and a
      SHA-256 hash of the exact document text agreed to, and is legally binding
      under the U.S. ESIGN Act and the Uniform Electronic Transactions Act
      (UETA). Consent statement: <em>{consent}</em>
    </p>
    {"".join(blocks)}
  </section>"""


async def _stored_signatures_for_cert(conn, agreement_id) -> list[dict]:
    """Load persisted signatures shaped for signature_certificate_html.
    A drawn signature's PNG is stored inline as a data: URI in
    signature_image_key, so no external fetch is needed at render time."""
    rows = await conn.fetch(
        """
        SELECT signer_role, signer_name, signer_email, method,
               signature_text, signature_image_key AS signature_data_uri,
               consent_text, document_sha256, ip_address, user_agent, signed_at
        FROM agreement_signatures
        WHERE agreement_id = $1
        ORDER BY signed_at
        """,
        agreement_id,
    )
    return [dict(r) for r in rows]


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

    rendered_md = await render_agreement_markdown(conn, dict(agreement))
    # A signed agreement carries its signature-certificate page instead of the
    # template's wet-ink signature block.
    extra_html = ""
    sigs = await _stored_signatures_for_cert(conn, agreement_id)
    if sigs:
        rendered_md = strip_wet_signatures(rendered_md)
        extra_html = signature_certificate_html(sigs)
    pdf_bytes = agreement_pdf_bytes(
        rendered_md, extra_html=extra_html,
        contract_number=agreement.get("contract_number"),
    )
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
