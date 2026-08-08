import pytest

from app.routes import contact_leads
from app.routes.contact_leads import ContactLeadCreate, create_contact_lead


@pytest.mark.asyncio
async def test_contact_lead_sends_email(monkeypatch):
    sent: dict = {}

    def fake_send_email(**kwargs):
        sent.update(kwargs)
        return "test-message-id"

    monkeypatch.setattr(contact_leads, "send_email", fake_send_email)

    result = await create_contact_lead(
        ContactLeadCreate(
            name="Preview Parent",
            email="parent@example.com",
            phone="314-555-0100",
            message="We are considering a school transition.",
        )
    )

    assert result == {"status": "accepted", "message_id": "test-message-id"}
    assert sent["to"] == "joe@ng20.org"
    assert sent["reply_to"] == "parent@example.com"
    assert sent["subject"] == "New HillCo inquiry from Preview Parent"
    assert "Name: Preview Parent" in sent["body_text"]
    assert "Email: parent@example.com" in sent["body_text"]
    assert "Phone: 314-555-0100" in sent["body_text"]
    assert "We are considering a school transition." in sent["body_text"]
