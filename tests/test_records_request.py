"""Records Request: created from its template on first send, emailed as a
PDF, every send logged, re-sendable, and auto-sent on e-signature when the
operator opted in when sending the services contract for signature."""
from uuid import uuid4

import pytest

import app.email as email_mod
import app.routes.agreements as agreements_mod
import app.routes.signing as signing_mod
from app import s3
from app.signing import make_signing_token


@pytest.fixture(autouse=True)
def _no_side_effects(monkeypatch):
    """Stub outbound email + S3 + PDF render (CI's unit job has no WeasyPrint
    system libs; the real render is covered by the drawn-signature e2e)."""
    sent: list[dict] = []
    monkeypatch.setattr(signing_mod, "agreement_pdf_bytes", lambda *a, **k: b"%PDF-1.4 fake")
    monkeypatch.setattr(agreements_mod, "agreement_pdf_bytes", lambda *a, **k: b"%PDF-1.4 fake")

    def fake_send_email(*, to, subject, body_text, body_html=None, cc=None,
                        bcc=None, reply_to=None, attachments=()):
        sent.append({"to": to, "subject": subject, "body_text": body_text,
                     "attachments": list(attachments)})
        return "msg-id"

    monkeypatch.setattr(email_mod, "send_email", fake_send_email)
    monkeypatch.setattr(s3, "put", lambda *a, **k: None)
    return sent


async def _engagement_with_contract(authed_client):
    """Fixed-fee engagement with a billing guardian (email + address) and a
    draft services contract from the fixed-fee template."""
    suffix = uuid4().hex[:10]
    t = (await authed_client.post(
        "/api/engagement-types",
        json={"code": f"t_{suffix}", "label": f"Fixed {suffix}",
              "billing_mode": "fixed", "default_fixed_fee": "2500.00"},
    )).json()
    fam = (await authed_client.post(
        "/api/families", json={"household_name": f"Records {suffix}"}
    )).json()
    guardian_email = f"guardian-{suffix}@example.test"
    await authed_client.post(
        f"/api/families/{fam['id']}/parents",
        json={"first_name": "Bill", "last_name": "Payer", "email": guardian_email,
              "role": "guardian", "is_primary_contact": True, "is_billing_contact": True,
              "street1": "1 Main St", "postal_code": "62701"},
    )
    student = (await authed_client.post(
        f"/api/families/{fam['id']}/students",
        json={"first_name": "Kid", "last_name": suffix, "current_grade": "5"},
    )).json()
    eng = (await authed_client.post(
        f"/api/families/{fam['id']}/engagements",
        json={"student_id": student["id"], "engagement_type": t["code"]},
    )).json()
    templates = (await authed_client.get(
        "/api/contract-templates?kind=services_contract&billing_mode=fixed"
    )).json()
    ag = (await authed_client.post(
        f"/api/engagements/{eng['id']}/agreements",
        json={"type": "services_contract", "template_id": templates[0]["id"]},
    )).json()
    return {"agreement_id": ag["id"], "engagement_id": eng["id"],
            "guardian_email": guardian_email}


async def _sign(authed_client, client, db_pool, agreement_id, *, auto_send: bool):
    r = await authed_client.post(
        f"/api/agreements/{agreement_id}/send-for-signature",
        json={"auto_send_records_request": auto_send},
    )
    assert r.status_code == 200, r.text
    async with db_pool.acquire() as conn:
        nonce = await conn.fetchval(
            "SELECT signing_nonce FROM agreements WHERE id = $1", agreement_id
        )
    token = make_signing_token(agreement_id, nonce)
    r = await client.post(
        f"/api/sign/{token}",
        json={"signer_name": "Bill Payer", "method": "typed",
              "signature_text": "Bill Payer", "consent": True},
    )
    assert r.status_code == 200, r.text


def _records_requests(agreements: list[dict]) -> list[dict]:
    return [a for a in agreements if a["type"] == "records_request"]


async def test_send_creates_from_template_logs_and_resends(
    authed_client, _no_side_effects
):
    s = await _engagement_with_contract(authed_client)
    eng = s["engagement_id"]

    r = await authed_client.post(f"/api/engagements/{eng}/records-request/send")
    assert r.status_code == 200, r.text
    assert r.json()["sent_to"] == s["guardian_email"]

    # One email, PDF attached, to the billing guardian.
    sent = _no_side_effects
    assert len(sent) == 1
    assert sent[0]["to"] == s["guardian_email"]
    assert "records request" in sent[0]["subject"].lower()
    assert sent[0]["attachments"][0][0] == "records-request.pdf"

    # Created from the template, marked sent, send logged.
    rrs = _records_requests((await authed_client.get(f"/api/engagements/{eng}/agreements")).json())
    assert len(rrs) == 1
    rr = rrs[0]
    assert rr["status"] == "draft" and rr["sent_at"] is not None
    assert rr["send_count"] == 1
    assert "Records to send" in rr["body_markdown"]
    assert rr["contract_number"] is None

    history = (await authed_client.get(f"/api/agreements/{rr['id']}/emails")).json()
    assert len(history) == 1
    assert history[0]["to_address"] == s["guardian_email"]
    assert history[0]["purpose"] == "records_request"

    # Resend: same agreement, second log row — never a second agreement.
    r = await authed_client.post(f"/api/engagements/{eng}/records-request/send")
    assert r.status_code == 200, r.text
    rrs = _records_requests((await authed_client.get(f"/api/engagements/{eng}/agreements")).json())
    assert len(rrs) == 1 and rrs[0]["send_count"] == 2
    assert len((await authed_client.get(f"/api/agreements/{rr['id']}/emails")).json()) == 2

    # The agreement-level endpoint resends too, and refuses non-records types.
    assert (await authed_client.post(f"/api/agreements/{rr['id']}/send")).status_code == 200
    bad = await authed_client.post(f"/api/agreements/{s['agreement_id']}/send")
    assert bad.status_code == 400


async def test_auto_send_on_signature_when_opted_in(
    authed_client, client, db_pool, _no_side_effects
):
    s = await _engagement_with_contract(authed_client)
    await _sign(authed_client, client, db_pool, s["agreement_id"], auto_send=True)

    subjects = [m["subject"] for m in _no_side_effects]
    assert any(sub.startswith("Signed:") for sub in subjects)
    assert any("records request" in sub.lower() for sub in subjects)

    agreements = (await authed_client.get(f"/api/engagements/{s['engagement_id']}/agreements")).json()
    contract = next(a for a in agreements if a["id"] == s["agreement_id"])
    assert contract["status"] == "active"
    assert contract["auto_send_records_request"] is True
    rrs = _records_requests(agreements)
    assert len(rrs) == 1 and rrs[0]["send_count"] == 1
    assert rrs[0]["sent_at"] is not None


async def test_no_auto_send_when_declined(authed_client, client, db_pool, _no_side_effects):
    s = await _engagement_with_contract(authed_client)
    await _sign(authed_client, client, db_pool, s["agreement_id"], auto_send=False)

    subjects = [m["subject"] for m in _no_side_effects]
    assert not any("records request" in sub.lower() for sub in subjects)
    agreements = (await authed_client.get(f"/api/engagements/{s['engagement_id']}/agreements")).json()
    assert _records_requests(agreements) == []


async def test_medical_release_template_is_retired(authed_client):
    active = (await authed_client.get("/api/contract-templates?kind=medical_release")).json()
    assert active == []
    everything = (await authed_client.get(
        "/api/contract-templates?kind=medical_release&include_inactive=true"
    )).json()
    assert len(everything) == 1 and everything[0]["is_active"] is False
    records = (await authed_client.get("/api/contract-templates?kind=records_request")).json()
    assert len(records) == 1 and records[0]["is_active"] is True
