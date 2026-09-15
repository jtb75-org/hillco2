"""In-app e-signature flow: send-for-signature, the public signing view, and
submitting a typed/drawn signature (recording the firm + client audit trail,
generating the signed PDF, and activating the agreement)."""
from uuid import uuid4

import pytest

import app.email as email_mod
import app.routes.signing as signing_mod
from app import s3
from app.signing import make_signing_token, read_signing_token


@pytest.fixture(autouse=True)
def _no_side_effects(monkeypatch):
    """Stub outbound email + S3 + PDF render so the flow is hermetic (CI has no
    WeasyPrint system libs; the real render path is covered by the e2e
    contract-PDF tests)."""
    sent: list[dict] = []

    monkeypatch.setattr(signing_mod, "agreement_pdf_bytes", lambda *a, **k: b"%PDF-1.4 fake")

    # Mirror the real send_email signature so a wrong kwarg (e.g. html=) fails
    # here too, not only in e2e.
    def fake_send_email(*, to, subject, body_text, body_html=None, cc=None,
                        bcc=None, reply_to=None, attachments=()):
        sent.append({"to": to, "subject": subject, "body_text": body_text,
                     "body_html": body_html, "cc": cc,
                     "attachments": list(attachments)})
        return "msg-id"

    monkeypatch.setattr(email_mod, "send_email", fake_send_email)
    monkeypatch.setattr(s3, "put", lambda *a, **k: None)
    return sent


async def _signable(authed_client):
    """Create a fixed-fee engagement + agreement with a billing guardian that has
    an email + address, so the contract has no unfilled variables and the client
    email resolves. Returns ids + the guardian email."""
    suffix = uuid4().hex[:10]
    t = (await authed_client.post(
        "/api/engagement-types",
        json={"code": f"t_{suffix}", "label": f"Fixed {suffix}",
              "billing_mode": "fixed", "default_fixed_fee": "2500.00"},
    )).json()
    fam = (await authed_client.post(
        "/api/families", json={"household_name": f"Esign {suffix}"}
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
    template_id = templates[0]["id"]
    ag = (await authed_client.post(
        f"/api/engagements/{eng['id']}/agreements",
        json={"type": "services_contract", "template_id": template_id},
    )).json()
    return {"agreement_id": ag["id"], "engagement_id": eng["id"],
            "family_id": fam["id"], "guardian_email": guardian_email}


async def _nonce(db_pool, agreement_id):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT signing_nonce FROM agreements WHERE id = $1", agreement_id
        )


# ---- token round-trip -----------------------------------------------------

def test_signing_token_round_trips():
    aid = uuid4()
    nonce = uuid4()
    tok = make_signing_token(aid, nonce)
    got = read_signing_token(tok)
    assert got == (aid, str(nonce))


def test_bad_token_returns_none():
    assert read_signing_token("garbage.token.value") is None


# ---- send for signature ---------------------------------------------------

async def test_send_for_signature_sets_nonce_and_emails(authed_client, db_pool, _no_side_effects):
    s = await _signable(authed_client)
    r = await authed_client.post(f"/api/agreements/{s['agreement_id']}/send-for-signature")
    assert r.status_code == 200, r.text
    assert r.json()["sent_to"] == s["guardian_email"]
    assert await _nonce(db_pool, s["agreement_id"]) is not None
    msg = _no_side_effects[0]
    assert "/sign/" in msg["body_text"]
    # Branded HTML letterhead with the signing link.
    assert msg["body_html"] and "HILL" in msg["body_html"]
    assert "/sign/" in msg["body_html"]


async def test_send_for_signature_requires_client_email(authed_client):
    # A family with no guardian email → cannot send.
    suffix = uuid4().hex[:10]
    t = (await authed_client.post(
        "/api/engagement-types",
        json={"code": f"t_{suffix}", "label": f"F {suffix}",
              "billing_mode": "fixed", "default_fixed_fee": "1000"},
    )).json()
    fam = (await authed_client.post("/api/families", json={"household_name": f"NoEmail {suffix}"})).json()
    student = (await authed_client.post(
        f"/api/families/{fam['id']}/students",
        json={"first_name": "K", "last_name": suffix, "current_grade": "5"},
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
    r = await authed_client.post(f"/api/agreements/{ag['id']}/send-for-signature")
    assert r.status_code == 400
    assert "email" in r.json()["detail"].lower()


# ---- public signing view --------------------------------------------------

async def test_public_view_shows_contract(authed_client, client, db_pool):
    s = await _signable(authed_client)
    await authed_client.post(f"/api/agreements/{s['agreement_id']}/send-for-signature")
    token = make_signing_token(s["agreement_id"], await _nonce(db_pool, s["agreement_id"]))

    r = await client.get(f"/api/sign/{token}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "draft"
    assert data["signed"] is False
    assert "EDUCATIONAL CONSULTING SERVICES AGREEMENT" in data["body_html"]


async def test_public_view_rejects_bad_token(client):
    r = await client.get("/api/sign/not-a-real-token")
    assert r.status_code == 404


# ---- submit signature -----------------------------------------------------

async def test_typed_signature_signs_and_records_audit(authed_client, client, db_pool, _no_side_effects):
    s = await _signable(authed_client)
    await authed_client.post(f"/api/agreements/{s['agreement_id']}/send-for-signature")
    token = make_signing_token(s["agreement_id"], await _nonce(db_pool, s["agreement_id"]))

    r = await client.post(
        f"/api/sign/{token}",
        json={"signer_name": "Bill Payer", "method": "typed",
              "signature_text": "Bill Payer", "consent": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "signed"

    # Agreement is now active with a signed date + attached document.
    ag = (await authed_client.get(f"/api/agreements/{s['agreement_id']}")).json()
    assert ag["status"] == "active"
    assert ag["signed_at"] is not None
    assert ag["document_id"] is not None

    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT signer_role, signer_name, method, ip_address, user_agent, "
            "document_sha256 FROM agreement_signatures WHERE agreement_id = $1 "
            "ORDER BY signer_role",
            s["agreement_id"],
        )
    roles = {row["signer_role"] for row in rows}
    assert roles == {"client", "firm"}
    client_row = next(r for r in rows if r["signer_role"] == "client")
    assert client_row["signer_name"] == "Bill Payer"
    assert client_row["document_sha256"]  # hash captured
    # Completed-PDF email went to both parties.
    assert any("Signed" in m["subject"] for m in _no_side_effects)


async def test_cannot_sign_twice(authed_client, client, db_pool):
    s = await _signable(authed_client)
    await authed_client.post(f"/api/agreements/{s['agreement_id']}/send-for-signature")
    token = make_signing_token(s["agreement_id"], await _nonce(db_pool, s["agreement_id"]))
    body = {"signer_name": "Bill", "method": "typed", "signature_text": "Bill", "consent": True}
    assert (await client.post(f"/api/sign/{token}", json=body)).status_code == 200
    r2 = await client.post(f"/api/sign/{token}", json=body)
    assert r2.status_code == 409


async def test_consent_required(authed_client, client, db_pool):
    s = await _signable(authed_client)
    await authed_client.post(f"/api/agreements/{s['agreement_id']}/send-for-signature")
    token = make_signing_token(s["agreement_id"], await _nonce(db_pool, s["agreement_id"]))
    r = await client.post(
        f"/api/sign/{token}",
        json={"signer_name": "Bill", "method": "typed", "signature_text": "Bill", "consent": False},
    )
    assert r.status_code == 400


async def test_drawn_signature_accepted(authed_client, client, db_pool):
    s = await _signable(authed_client)
    await authed_client.post(f"/api/agreements/{s['agreement_id']}/send-for-signature")
    token = make_signing_token(s["agreement_id"], await _nonce(db_pool, s["agreement_id"]))
    # 1x1 transparent PNG.
    png = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
           "AAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
    r = await client.post(
        f"/api/sign/{token}",
        json={"signer_name": "Bill Payer", "method": "drawn",
              "signature_data_uri": png, "consent": True},
    )
    assert r.status_code == 200, r.text
    async with db_pool.acquire() as conn:
        img = await conn.fetchval(
            "SELECT signature_image_key FROM agreement_signatures "
            "WHERE agreement_id = $1 AND signer_role = 'client'",
            s["agreement_id"],
        )
    assert img and img.startswith("data:image/png;base64,")


async def test_rotated_nonce_invalidates_old_link(authed_client, client, db_pool):
    s = await _signable(authed_client)
    await authed_client.post(f"/api/agreements/{s['agreement_id']}/send-for-signature")
    old_token = make_signing_token(s["agreement_id"], await _nonce(db_pool, s["agreement_id"]))
    # Re-send rotates the nonce → the old link no longer resolves.
    await authed_client.post(f"/api/agreements/{s['agreement_id']}/send-for-signature")
    assert (await client.get(f"/api/sign/{old_token}")).status_code == 404


# ---- signer-filled fields (medical release) --------------------------------

async def _medrel_agreement(authed_client, engagement_id):
    templates = (await authed_client.get(
        "/api/contract-templates?kind=medical_release"
    )).json()
    return (await authed_client.post(
        f"/api/engagements/{engagement_id}/agreements",
        json={"type": "medical_release", "template_id": templates[0]["id"]},
    )).json()


async def test_medical_release_exposes_signer_fields(authed_client, client, db_pool):
    s = await _signable(authed_client)
    ag = await _medrel_agreement(authed_client, s["engagement_id"])
    await authed_client.post(f"/api/agreements/{ag['id']}/send-for-signature")
    token = make_signing_token(ag["id"], await _nonce(db_pool, ag["id"]))

    view = (await client.get(f"/api/sign/{token}")).json()
    names = [f["name"] for f in view["client_fields"]]
    # Releasing provider + records dates are client-filled, not operator/source.
    assert "releasing_provider_name" in names
    assert "records_date_from" in names
    # A date field is typed for a date input.
    from_field = next(f for f in view["client_fields"] if f["name"] == "records_date_from")
    assert from_field["type"] == "date"
    # Expiration is a single custom-choice field (not two free-text fields).
    exp = next(f for f in view["client_fields"] if f["name"] == "expiration")
    assert exp["type"] == "expiration"
    assert "expiration_specific_date" not in names
    assert "expiration_other_event" not in names
    # The wet-ink signature block is trimmed on the e-sign view.
    assert "Witness (Optional)" not in view["body_html"]
    assert "Parent / Legal Guardian" not in view["body_html"]


def test_strip_wet_signatures():
    from app.routes.agreements import strip_wet_signatures
    kept = strip_wet_signatures("Intro\n\n<!-- esign-cut -->\n\n# SIGNATURES\nSignature: __")
    assert "SIGNATURES" not in kept
    assert kept.strip() == "Intro"
    # No marker → returned unchanged.
    assert strip_wet_signatures("no marker here") == "no marker here"


async def test_signer_submits_field_values(authed_client, client, db_pool):
    s = await _signable(authed_client)
    ag = await _medrel_agreement(authed_client, s["engagement_id"])
    await authed_client.post(f"/api/agreements/{ag['id']}/send-for-signature")
    token = make_signing_token(ag["id"], await _nonce(db_pool, ag["id"]))

    r = await client.post(
        f"/api/sign/{token}",
        json={
            "signer_name": "Bill Payer", "method": "typed",
            "signature_text": "Bill Payer", "consent": True,
            "field_values": {
                "releasing_provider_name": "Dr. Smith Clinic",
                "records_date_from": "2020-01-01",
                "expiration": "Specific date: 2027-01-01",
                # Not a signer variable → must be ignored (security).
                "fixed_fee": "999999",
            },
        },
    )
    assert r.status_code == 200, r.text

    async with db_pool.acquire() as conn:
        raw = await conn.fetchval("SELECT variables FROM agreements WHERE id = $1", ag["id"])
    import json as _json
    vars_ = _json.loads(raw) if isinstance(raw, str) else raw
    assert vars_["releasing_provider_name"] == "Dr. Smith Clinic"
    assert vars_["records_date_from"] == "2020-01-01"
    assert vars_["expiration"] == "Specific date: 2027-01-01"
    assert "fixed_fee" not in vars_  # whitelisted keys only
