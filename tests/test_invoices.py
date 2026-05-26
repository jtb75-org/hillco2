"""Invoice state machine end-to-end. Invoices touch real money, the
mutations cascade to time_entries.invoice_id and expenses.invoice_id,
and the FOR UPDATE locks in the transitions are easy to miss in code
review. Worth wiring."""
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.templating import Jinja2Templates


async def _make_engagement(db_pool, user_id):
    """Set up a family + engagement with one billable time entry, return ids."""
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('app.user_id', $1, true)", str(user_id)
            )
            family_id = await conn.fetchval(
                "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
                f"Family-{uuid4()}",
            )
            student_id = await conn.fetchval(
                "INSERT INTO people (kind, first_name) VALUES ('student', 'Test Kid') RETURNING id"
            )
            await conn.execute(
                "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
                family_id, student_id,
            )
            await conn.execute(
                "INSERT INTO student_details (person_id) VALUES ($1)",
                student_id,
            )
            engagement_id = await conn.fetchval(
                """
                INSERT INTO engagements (
                  family_id, student_id, engagement_type, status, lead_consultant_id,
                  default_hourly_rate
                )
                VALUES ($1, $2, 'assessment', 'in_progress', $3, 175.00)
                RETURNING id
                """,
                family_id, student_id, user_id,
            )
            time_entry_id = await conn.fetchval(
                """
                INSERT INTO time_entries (engagement_id, user_id, work_date, hours, billable)
                VALUES ($1, $2, CURRENT_DATE, 2.5, TRUE) RETURNING id
                """,
                engagement_id, user_id,
            )
    return family_id, engagement_id, time_entry_id


async def test_invoice_full_lifecycle(authed_client, db_pool, test_user):
    family_id, engagement_id, time_entry_id = await _make_engagement(db_pool, test_user["id"])

    # Create draft from the time entry
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [str(time_entry_id)]},
    )
    assert r.status_code == 201, r.text
    invoice = r.json()
    invoice_id = invoice["id"]
    assert invoice["status"] == "draft"
    assert invoice["invoice_number"].startswith("HC-"), invoice["invoice_number"]
    # subtotal = 2.5h * $175 = 437.50
    assert float(invoice["subtotal"]) == 437.50

    # Time entry is now linked to the invoice
    async with db_pool.acquire() as conn:
        link = await conn.fetchval(
            "SELECT invoice_id FROM time_entries WHERE id = $1", time_entry_id
        )
    assert str(link) == invoice_id

    # Send it
    r = await authed_client.post(f"/api/invoices/{invoice_id}/send")
    assert r.status_code == 200
    assert r.json()["status"] == "sent"

    # Can't send a second time (only drafts can be sent)
    r = await authed_client.post(f"/api/invoices/{invoice_id}/send")
    assert r.status_code == 400

    # Mark it paid (default amount = total)
    r = await authed_client.post(f"/api/invoices/{invoice_id}/mark-paid", json={})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paid"

    # Voiding a paid invoice is rejected (would silently re-open the time
    # entry for re-billing; refunds need an explicit reversal flow)
    r = await authed_client.post(f"/api/invoices/{invoice_id}/void")
    assert r.status_code == 400


async def test_partial_payment_rejected(authed_client, db_pool, test_user):
    _, engagement_id, time_entry_id = await _make_engagement(db_pool, test_user["id"])
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [str(time_entry_id)]},
    )
    invoice_id = r.json()["id"]
    await authed_client.post(f"/api/invoices/{invoice_id}/send")

    r = await authed_client.post(
        f"/api/invoices/{invoice_id}/mark-paid",
        json={"paid_amount": "100.00"},
    )
    assert r.status_code == 400
    assert "Partial payments" in r.json()["detail"]


async def test_void_releases_time_entry(authed_client, db_pool, test_user):
    _, engagement_id, time_entry_id = await _make_engagement(db_pool, test_user["id"])
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [str(time_entry_id)]},
    )
    invoice_id = r.json()["id"]
    await authed_client.post(f"/api/invoices/{invoice_id}/send")

    r = await authed_client.post(f"/api/invoices/{invoice_id}/void")
    assert r.status_code == 200
    assert r.json()["status"] == "void"

    async with db_pool.acquire() as conn:
        link = await conn.fetchval(
            "SELECT invoice_id FROM time_entries WHERE id = $1", time_entry_id
        )
    assert link is None, "voided invoice should release its time entry back to uninvoiced"


async def test_cant_delete_time_entry_attached_to_invoice(authed_client, db_pool, test_user):
    _, engagement_id, time_entry_id = await _make_engagement(db_pool, test_user["id"])
    await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [str(time_entry_id)]},
    )
    # Time entry is now on the invoice; deleting it should be blocked
    r = await authed_client.delete(f"/api/time-entries/{time_entry_id}")
    assert r.status_code == 400
    assert "invoice" in r.json()["detail"].lower()


async def test_cant_create_invoice_with_no_lines(authed_client, db_pool, test_user):
    _, engagement_id, _ = await _make_engagement(db_pool, test_user["id"])
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [], "expense_ids": []},
    )
    assert r.status_code == 400


async def test_create_invoice_rejects_zero_rate_time_entry(authed_client, db_pool, test_user):
    """When neither the entry nor the engagement has a rate, the API used
    to silently bill at $0. That's a real-money footgun — guard with 400."""
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"Family-{uuid4()}",
        )
        student_id = await conn.fetchval(
            "INSERT INTO people (kind, first_name) VALUES ('student', 'No Rate Kid') RETURNING id"
        )
        await conn.execute(
            "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
            family_id, student_id,
        )
        await conn.execute(
            "INSERT INTO student_details (person_id) VALUES ($1)", student_id,
        )
        # Engagement deliberately omits default_hourly_rate.
        engagement_id = await conn.fetchval(
            """
            INSERT INTO engagements (family_id, student_id, engagement_type, status, lead_consultant_id)
            VALUES ($1, $2, 'assessment', 'in_progress', $3)
            RETURNING id
            """,
            family_id, student_id, test_user["id"],
        )
        # Time entry without an explicit hourly_rate.
        time_entry_id = await conn.fetchval(
            """
            INSERT INTO time_entries (engagement_id, user_id, work_date, hours, billable)
            VALUES ($1, $2, CURRENT_DATE, 1.0, TRUE) RETURNING id
            """,
            engagement_id, test_user["id"],
        )

    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [str(time_entry_id)]},
    )
    assert r.status_code == 400
    assert "rate" in r.json()["detail"].lower()


async def test_patch_draft_rejects_due_before_issue(authed_client, db_pool, test_user):
    """due_date must be on or after issue_date — applies even when the
    PATCH only supplies one of them (the missing one falls back to the
    current row)."""
    _, engagement_id, time_entry_id = await _make_engagement(db_pool, test_user["id"])
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [str(time_entry_id)]},
    )
    invoice_id = r.json()["id"]

    # Set issue date first.
    r = await authed_client.patch(
        f"/api/invoices/{invoice_id}", json={"issue_date": "2026-05-25"},
    )
    assert r.status_code == 200, r.text

    # Now try to set a due_date earlier than issue_date — should 400.
    r = await authed_client.patch(
        f"/api/invoices/{invoice_id}", json={"due_date": "2026-05-20"},
    )
    assert r.status_code == 400
    assert "due_date" in r.json()["detail"]

    # Same-day is fine.
    r = await authed_client.patch(
        f"/api/invoices/{invoice_id}", json={"due_date": "2026-05-25"},
    )
    assert r.status_code == 200, r.text


async def test_void_releases_expense(authed_client, db_pool, test_user):
    """Existing tests cover void releasing a time_entry; mirror the check
    for expenses so the helper's symmetry is verified end-to-end."""
    _, engagement_id, _ = await _make_engagement(db_pool, test_user["id"])
    async with db_pool.acquire() as conn:
        expense_id = await conn.fetchval(
            """
            INSERT INTO expenses (engagement_id, user_id, expense_date, amount, billable)
            VALUES ($1, $2, CURRENT_DATE, 50.00, TRUE) RETURNING id
            """,
            engagement_id, test_user["id"],
        )

    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"expense_ids": [str(expense_id)]},
    )
    assert r.status_code == 201, r.text
    invoice_id = r.json()["id"]
    await authed_client.post(f"/api/invoices/{invoice_id}/send")

    r = await authed_client.post(f"/api/invoices/{invoice_id}/void")
    assert r.status_code == 200

    async with db_pool.acquire() as conn:
        linked = await conn.fetchval(
            "SELECT invoice_id FROM expenses WHERE id = $1", expense_id,
        )
    assert linked is None, "voided invoice should release its expense back to uninvoiced"


async def test_list_invoices_q_matches_invoice_number_or_household(authed_client, db_pool, test_user):
    """The q filter is a case-insensitive substring match against either
    invoice_number or household_name. Powers the SPA list search box."""
    _, eng1, te1 = await _make_engagement(db_pool, test_user["id"])
    _, eng2, te2 = await _make_engagement(db_pool, test_user["id"])

    # Rename eng1's family to a known household name we can search for.
    async with db_pool.acquire() as conn:
        fam1 = await conn.fetchval(
            "SELECT family_id FROM engagements WHERE id = $1", eng1,
        )
        await conn.execute(
            "UPDATE families SET household_name = $1 WHERE id = $2",
            "Findable Household", fam1,
        )

    r = await authed_client.post(
        f"/api/engagements/{eng1}/invoices", json={"time_entry_ids": [str(te1)]},
    )
    assert r.status_code == 201
    inv1 = r.json()
    r = await authed_client.post(
        f"/api/engagements/{eng2}/invoices", json={"time_entry_ids": [str(te2)]},
    )
    assert r.status_code == 201
    inv2 = r.json()

    # Case-insensitive household match → eng1 only.
    r = await authed_client.get("/api/invoices", params={"status": "all", "q": "findable"})
    assert r.status_code == 200
    assert {i["id"] for i in r.json()["invoices"]} == {inv1["id"]}

    # Match by invoice_number prefix → that specific invoice only.
    r = await authed_client.get(
        "/api/invoices", params={"status": "all", "q": inv2["invoice_number"]},
    )
    assert {i["id"] for i in r.json()["invoices"]} == {inv2["id"]}

    # Empty/whitespace q is treated as "no filter".
    r = await authed_client.get("/api/invoices", params={"status": "all", "q": "  "})
    assert {inv1["id"], inv2["id"]}.issubset({i["id"] for i in r.json()["invoices"]})


async def test_list_invoices_date_range_filters(authed_client, db_pool, test_user):
    """issued_from/_to and due_from/_to are independent inclusive bounds."""
    _, engagement_id, time_entry_id = await _make_engagement(db_pool, test_user["id"])
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={
            "time_entry_ids": [str(time_entry_id)],
            "issue_date": "2026-05-25",
            "due_date": "2026-06-15",
        },
    )
    assert r.status_code == 201, r.text
    invoice_id = r.json()["id"]

    # Date ranges that contain the invoice → included.
    cases_in = [
        {"issued_from": "2026-05-25", "issued_to": "2026-05-25"},  # exact day
        {"issued_from": "2026-05-01"},  # open upper
        {"issued_to": "2026-12-31"},    # open lower
        {"due_from": "2026-06-15", "due_to": "2026-06-15"},
        {"due_from": "2026-06-01"},
    ]
    for params in cases_in:
        r = await authed_client.get("/api/invoices", params={"status": "all", **params})
        assert invoice_id in {i["id"] for i in r.json()["invoices"]}, params

    # Date ranges that exclude the invoice → not included.
    cases_out = [
        {"issued_from": "2026-05-26"},  # day after
        {"issued_to": "2026-05-24"},    # day before
        {"due_from": "2026-06-16"},
        {"due_to": "2026-06-14"},
    ]
    for params in cases_out:
        r = await authed_client.get("/api/invoices", params={"status": "all", **params})
        assert invoice_id not in {i["id"] for i in r.json()["invoices"]}, params


async def test_email_invoice_sends_pdf_records_audit_and_flips_status(
    authed_client, db_pool, test_user, monkeypatch,
):
    """POST /api/invoices/{id}/email sends the PDF, writes an audit
    row, and (for drafts) flips status to sent. Resend on already-sent
    invoice adds another row without changing status."""
    _, engagement_id, time_entry_id = await _make_engagement(db_pool, test_user["id"])

    # Attach a billing-contact guardian with an email so the default
    # recipient lookup has something to grab.
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "SELECT family_id FROM engagements WHERE id = $1", engagement_id,
        )
        guardian_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, last_name, email)
            VALUES ('guardian', 'Bill', 'Guardian', 'bill@example.test')
            RETURNING id
            """,
        )
        await conn.execute(
            """
            INSERT INTO family_guardians
                (family_id, person_id, is_primary_contact, is_billing_contact)
            VALUES ($1, $2, true, true)
            """,
            family_id, guardian_id,
        )

    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [str(time_entry_id)]},
    )
    assert r.status_code == 201
    invoice = r.json()
    invoice_id = invoice["id"]

    # Capture send_email call args; skip the real SMTP socket.
    sent_calls: list[dict] = []

    def fake_send_email(*, to, subject, body_text, cc, bcc, attachments, reply_to=None):
        sent_calls.append({
            "to": to, "subject": subject, "body_text": body_text,
            "cc": list(cc) if cc else [], "bcc": list(bcc) if bcc else [],
            "attachments": [(name, mime, len(data)) for name, mime, data in attachments],
        })
        return "<test-msgid@hillco2>"

    from app.routes import invoices as invoices_mod  # noqa: PLC0415
    monkeypatch.setattr(invoices_mod, "send_email", fake_send_email)
    # WeasyPrint isn't installed in the pytest container (libpango/cairo
    # missing) — short-circuit the PDF render here. End-to-end PDF byte
    # generation is exercised in the e2e container which does ship the
    # native libs.
    async def fake_render(_conn, _invoice):
        return b"%PDF-1.4\n% stub from test\n"
    monkeypatch.setattr(invoices_mod, "_render_invoice_pdf", fake_render)

    # First call: default recipient = billing guardian; status flips.
    r = await authed_client.post(f"/api/invoices/{invoice_id}/email", json={})
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["status"] == "sent"
    assert len(detail["emails"]) == 1
    assert detail["emails"][0]["to_address"] == "bill@example.test"
    assert detail["emails"][0]["smtp_message_id"] == "<test-msgid@hillco2>"
    assert len(sent_calls) == 1
    assert sent_calls[0]["to"] == "bill@example.test"
    assert invoice["invoice_number"] in sent_calls[0]["subject"]
    # PDF attachment present
    assert len(sent_calls[0]["attachments"]) == 1
    name, mime, size = sent_calls[0]["attachments"][0]
    assert name.endswith(".pdf")
    assert mime == "pdf"
    assert size > 0

    # Second call: explicit to override, custom subject; status stays
    # sent, but a second audit row appears.
    r = await authed_client.post(
        f"/api/invoices/{invoice_id}/email",
        json={
            "to": "another@example.test",
            "subject": "Friendly reminder",
            "cc": ["cc@example.test"],
        },
    )
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["status"] == "sent"  # unchanged
    assert len(detail["emails"]) == 2  # ordered DESC, so [0] is the latest
    assert detail["emails"][0]["to_address"] == "another@example.test"
    assert detail["emails"][0]["subject"] == "Friendly reminder"
    assert detail["emails"][0]["cc_addresses"] == ["cc@example.test"]
    assert sent_calls[-1]["to"] == "another@example.test"


async def test_email_invoice_rejects_when_no_recipient_available(
    authed_client, db_pool, test_user, monkeypatch,
):
    """If no billing/primary guardian has an email and the caller doesn't
    supply `to`, surface a 400 instead of silently dropping the send."""
    _, engagement_id, time_entry_id = await _make_engagement(db_pool, test_user["id"])
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [str(time_entry_id)]},
    )
    invoice_id = r.json()["id"]

    # Patch send_email to make sure it's NOT called.
    from app.routes import invoices as invoices_mod  # noqa: PLC0415
    monkeypatch.setattr(
        invoices_mod, "send_email",
        lambda **_: pytest.fail("send_email should not be called"),
    )

    r = await authed_client.post(f"/api/invoices/{invoice_id}/email", json={})
    assert r.status_code == 400
    assert "recipient" in r.json()["detail"].lower()


async def test_email_invoice_refuses_after_paid_or_void(
    authed_client, db_pool, test_user, monkeypatch,
):
    """Paid + void invoices shouldn't be re-emailed — they're not current."""
    from app.routes import invoices as invoices_mod  # noqa: PLC0415
    monkeypatch.setattr(invoices_mod, "send_email", lambda **_: "<x>")

    _, engagement_id, te = await _make_engagement(db_pool, test_user["id"])
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [str(te)]},
    )
    invoice_id = r.json()["id"]
    await authed_client.post(f"/api/invoices/{invoice_id}/send")
    await authed_client.post(f"/api/invoices/{invoice_id}/mark-paid", json={})

    r = await authed_client.post(f"/api/invoices/{invoice_id}/email", json={})
    assert r.status_code == 400
    assert "paid" in r.json()["detail"].lower()


async def test_custom_line_add_and_delete_recomputes_totals(authed_client, db_pool, test_user):
    """Custom lines feed the invoice subtotal/total just like time/expense
    lines. Verify adding bumps total, deleting reverts it."""
    _, engagement_id, time_entry_id = await _make_engagement(db_pool, test_user["id"])
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/invoices",
        json={"time_entry_ids": [str(time_entry_id)]},
    )
    invoice_id = r.json()["id"]
    starting_total = float(r.json()["total"])

    r = await authed_client.post(
        f"/api/invoices/{invoice_id}/line-items",
        json={"description": "Rush surcharge", "quantity": "1", "unit_price": "25.00"},
    )
    assert r.status_code == 201, r.text
    after_add = r.json()
    assert float(after_add["total"]) == starting_total + 25.00
    custom_line = next(li for li in after_add["line_items"] if li["source_type"] == "custom")

    r = await authed_client.delete(
        f"/api/invoices/{invoice_id}/line-items/{custom_line['id']}",
    )
    assert r.status_code == 204

    r = await authed_client.get(f"/api/invoices/{invoice_id}")
    assert float(r.json()["total"]) == starting_total


async def test_list_invoices_engagement_id_filter(authed_client, db_pool, test_user):
    """engagement_id query param narrows both the invoice list AND the
    per-engagement financial summary. Powers the SPA billing panel.

    Note: engagement_financial_summary excludes engagements where all of
    uninvoiced/billed/outstanding are zero. A *draft* invoice doesn't
    move any of those, so we send both invoices to give the summary
    something to return."""
    _, eng1, te1 = await _make_engagement(db_pool, test_user["id"])
    _, eng2, te2 = await _make_engagement(db_pool, test_user["id"])

    r = await authed_client.post(
        f"/api/engagements/{eng1}/invoices", json={"time_entry_ids": [str(te1)]},
    )
    assert r.status_code == 201, r.text
    inv1_id = r.json()["id"]
    await authed_client.post(f"/api/invoices/{inv1_id}/send")

    r = await authed_client.post(
        f"/api/engagements/{eng2}/invoices", json={"time_entry_ids": [str(te2)]},
    )
    assert r.status_code == 201, r.text
    inv2_id = r.json()["id"]
    await authed_client.post(f"/api/invoices/{inv2_id}/send")

    # Unfiltered (status=all) returns both
    r = await authed_client.get("/api/invoices", params={"status": "all"})
    assert r.status_code == 200
    ids = {i["id"] for i in r.json()["invoices"]}
    assert {inv1_id, inv2_id}.issubset(ids)

    # Filtered to eng1 returns only its invoice + its summary row
    r = await authed_client.get(
        "/api/invoices",
        params={"status": "all", "engagement_id": str(eng1)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert {i["id"] for i in body["invoices"]} == {inv1_id}
    assert {str(s["engagement_id"]) for s in body["summary"]} == {str(eng1)}


# ---- PDF template rendering ------------------------------------------------
#
# Avoiding WeasyPrint here: it's an optional native dependency that
# segfaults on stock macOS without libpango, and these assertions are
# about template content (which org_settings fields appear) rather than
# the rendered PDF bytes. End-to-end PDF rendering is covered by the
# /api/invoices/{id}/pdf endpoint in containerized CI.


_INVOICE_TEMPLATE_CTX = {
    "invoice": {
        "invoice_number": "HC-2026-0001",
        "status": "draft",
        "issue_date": None,
        "due_date": None,
        "subtotal": Decimal("100.00"),
        "tax": Decimal("0"),
        "total": Decimal("100.00"),
        "paid_amount": None,
        "paid_date": None,
        "household_name": "Test Family",
        "notes": None,
    },
    "line_items": [],
    "primary_contact": None,
    "is_overdue": False,
}


def _render_invoice_pdf_template(org: dict) -> str:
    templates = Jinja2Templates(directory="app/templates")
    return templates.env.get_template("invoices/_pdf.html").render(
        org=org, **_INVOICE_TEMPLATE_CTX,
    )


def test_invoice_pdf_template_uses_org_settings():
    """Firm name + address from org_settings show through to the rendered
    HTML in place of the prior hardcoded placeholders."""
    html = _render_invoice_pdf_template({
        "firm_name": "Acme Educational Consulting",
        "firm_street1": "123 Main St",
        "firm_street2": None,
        "firm_city": "Springfield",
        "firm_state": "IL",
        "firm_postal_code": "62701",
        "firm_country": None,
    })
    assert "Acme Educational Consulting" in html
    assert "123 Main St" in html
    assert "Springfield, IL" in html
    assert "62701" in html
    # Placeholders from the pre-org-settings template must be gone
    assert "[Your address line 1]" not in html
    assert "[hello@hillco.example]" not in html


def test_invoice_pdf_template_falls_back_when_org_empty():
    """org_settings is seeded with all-NULL fields by migration 0019. The
    template must render cleanly in that state (no broken placeholders)."""
    html = _render_invoice_pdf_template(org={})
    assert "HillCo" in html
    assert "[Your address line 1]" not in html
    assert "[hello@hillco.example]" not in html
