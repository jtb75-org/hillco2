"""Public (no-login) e-signature endpoints for agreements.

The client opens a tokenized link — no session required; the signed, expiring
token IS the capability. They review the rendered contract, type or draw a
signature, consent to sign electronically, and submit. On submit we record the
firm's countersignature and the client's signature (with an ESIGN/UETA audit
trail), generate the signed PDF (contract + signature-certificate page), attach
it to the agreement, flip the agreement to active, and email the completed
document to both parties.
"""
from datetime import UTC, datetime

import asyncpg
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..db import request_conn
from ..signing import document_sha256, read_signing_token
from .agreements import (
    _billing_recipient,
    _build_default_context,
    _stored_signatures_for_cert,
    agreement_pdf_bytes,
    markdown_to_fragment,
    render_agreement_markdown,
    signature_certificate_html,
)
from .documents import store_document_bytes

router = APIRouter(prefix="/api", tags=["signing"])

CONSENT_TEXT = (
    "I agree to sign this agreement electronically, and I agree that my "
    "electronic signature is the legal equivalent of my handwritten signature "
    "under the U.S. ESIGN Act and UETA."
)
FIRM_CONSENT_TEXT = (
    "The firm executed this agreement electronically upon sending it for "
    "signature."
)
# A drawn signature is a small PNG data: URI; cap well below the PDF fetcher's.
MAX_SIGNATURE_DATA_URI = 2 * 1024 * 1024


class SignSubmission(BaseModel):
    signer_name: str = Field(..., min_length=1, max_length=200)
    method: str = Field(..., pattern="^(typed|drawn)$")
    signature_text: str | None = Field(default=None, max_length=200)
    signature_data_uri: str | None = None
    consent: bool = False


def _client_ip(request: Request) -> str | None:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None


async def _agreement_for_token(conn, token: str):
    parsed = read_signing_token(token)
    if not parsed:
        raise HTTPException(status_code=404, detail="This signing link is invalid or has expired.")
    agreement_id, nonce = parsed
    row = await conn.fetchrow("SELECT * FROM agreements WHERE id = $1", agreement_id)
    if row is None or row["signing_nonce"] is None or str(row["signing_nonce"]) != nonce:
        raise HTTPException(status_code=404, detail="This signing link is invalid or has expired.")
    return row


@router.get("/sign/{token}")
async def get_signing_view(token: str):
    async with request_conn() as conn:
        row = await _agreement_for_token(conn, token)
        if not row.get("body_markdown"):
            raise HTTPException(status_code=400, detail="This agreement has no contract to sign.")
        ctx = await _build_default_context(conn, dict(row))
        rendered_md = await render_agreement_markdown(conn, dict(row))
        signed = row["status"] == "active"
        return {
            "contract_number": row.get("contract_number"),
            "client_name": ctx.get("client_name"),
            "firm_name": ctx.get("consultant_name") or "HillCo Educational Consulting",
            "body_html": markdown_to_fragment(rendered_md),
            "status": row["status"],
            "signed": signed,
            "consent_text": CONSENT_TEXT,
        }


@router.get("/sign/{token}/pdf")
async def get_signing_pdf(token: str):
    from fastapi.responses import Response  # noqa: PLC0415

    async with request_conn() as conn:
        row = await _agreement_for_token(conn, token)
        rendered_md = await render_agreement_markdown(conn, dict(row))
        sigs = await _stored_signatures_for_cert(conn, row["id"])
        extra = signature_certificate_html(sigs) if sigs else ""
        pdf = agreement_pdf_bytes(rendered_md, extra_html=extra)
    name = row.get("contract_number") or f"agreement-{str(row['id'])[:8]}"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{name}.pdf"'},
    )


@router.post("/sign/{token}")
async def submit_signature(token: str, body: SignSubmission, request: Request):
    from ..email import (  # noqa: PLC0415
        EmailSendError,
        render_letterhead_email,
        send_email,
    )

    async with request_conn() as conn:
        row = await _agreement_for_token(conn, token)
        if row["status"] == "active":
            raise HTTPException(status_code=409, detail="This agreement has already been signed.")
        if row["status"] != "draft":
            raise HTTPException(
                status_code=400,
                detail=f"This agreement can no longer be signed (status: {row['status']}).",
            )
        if not body.consent:
            raise HTTPException(status_code=400, detail="You must consent to sign electronically.")
        if body.method == "typed" and not (body.signature_text or "").strip():
            raise HTTPException(status_code=400, detail="Please type your signature.")
        if body.method == "drawn":
            uri = body.signature_data_uri or ""
            if not uri.startswith("data:image/png;base64,"):
                raise HTTPException(status_code=400, detail="Invalid drawn signature.")
            if len(uri) > MAX_SIGNATURE_DATA_URI:
                raise HTTPException(status_code=413, detail="Signature image is too large.")

        eng = await conn.fetchrow(
            "SELECT lead_consultant_id FROM engagements WHERE id = $1",
            row["engagement_id"],
        )
        lead_consultant_id = eng["lead_consultant_id"] if eng else None
        ctx = await _build_default_context(conn, dict(row))
        firm_name = ctx.get("consultant_name") or "HillCo Educational Consulting"
        client_email = await _billing_recipient(conn, row["engagement_id"])

        rendered_md = await render_agreement_markdown(conn, dict(row))
        doc_hash = document_sha256(rendered_md)
        now = datetime.now(UTC)
        ip = _client_ip(request)
        ua = request.headers.get("user-agent")

        firm_sig = {
            "signer_role": "firm",
            "signer_name": firm_name,
            "signer_email": ctx.get("consultant_email"),
            "method": "typed",
            "signature_text": firm_name,
            "signature_data_uri": None,
            "consent_text": FIRM_CONSENT_TEXT,
            "document_sha256": doc_hash,
            "ip_address": None,
            "user_agent": None,
            "signed_at": row.get("signing_sent_at") or now,
        }
        client_sig = {
            "signer_role": "client",
            "signer_name": body.signer_name.strip(),
            "signer_email": client_email,
            "method": body.method,
            "signature_text": (body.signature_text or "").strip() or None,
            "signature_data_uri": body.signature_data_uri if body.method == "drawn" else None,
            "consent_text": CONSENT_TEXT,
            "document_sha256": doc_hash,
            "ip_address": ip,
            "user_agent": ua,
            "signed_at": now,
        }

        try:
            async with conn.transaction():
                for s in (firm_sig, client_sig):
                    await conn.execute(
                        """
                        INSERT INTO agreement_signatures (
                          agreement_id, signer_role, signer_name, signer_email,
                          method, signature_text, signature_image_key,
                          consent_text, document_sha256, ip_address, user_agent,
                          signed_at
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                        """,
                        row["id"], s["signer_role"], s["signer_name"], s["signer_email"],
                        s["method"], s["signature_text"], s["signature_data_uri"],
                        s["consent_text"], s["document_sha256"], s["ip_address"],
                        s["user_agent"], s["signed_at"],
                    )
                cert = signature_certificate_html([firm_sig, client_sig])
                pdf = agreement_pdf_bytes(rendered_md, extra_html=cert)
                contract_no = row.get("contract_number") or f"agreement-{str(row['id'])[:8]}"
                doc = await store_document_bytes(
                    conn,
                    owner_type="agreement",
                    owner_id=row["id"],
                    kind="other",
                    filename=f"{contract_no}-signed.pdf",
                    content_type="application/pdf",
                    data=pdf,
                    uploaded_by=lead_consultant_id,
                )
                await conn.execute(
                    """
                    UPDATE agreements
                    SET status = 'active',
                        signed_at = CURRENT_DATE,
                        document_id = $2
                    WHERE id = $1
                    """,
                    row["id"], doc["id"],
                )
        except asyncpg.UniqueViolationError as exc:
            raise HTTPException(
                status_code=409,
                detail="An active contract of this type already exists for the engagement.",
            ) from exc

    # Email the completed PDF to both parties (best-effort; signing already
    # succeeded, so a mail hiccup must not fail the request).
    primary = client_sig["signer_email"] or firm_sig["signer_email"]
    cc = [
        e
        for e in [firm_sig["signer_email"]]
        if e and e != primary
    ]
    if primary:
        try:
            send_email(
                to=primary,
                cc=cc,
                subject=f"Signed: {contract_no}",
                body_text=(
                    f"Thank you — {contract_no} has been signed electronically. "
                    "The fully executed agreement is attached for your records.\n\n"
                    "— HillCo Educational Consulting"
                ),
                body_html=render_letterhead_email(
                    heading="Your agreement is signed",
                    paragraphs=[
                        f"Thank you — {contract_no} has been signed electronically.",
                        "The fully executed agreement is attached to this email for "
                        "your records.",
                    ],
                ),
                attachments=[(f"{contract_no}-signed.pdf", "pdf", pdf)],
            )
        except EmailSendError:
            pass

    return {"status": "signed"}
