"""Invoice state machine end-to-end. Invoices touch real money, the
mutations cascade to time_entries.invoice_id and expenses.invoice_id,
and the FOR UPDATE locks in the transitions are easy to miss in code
review. Worth wiring."""
from uuid import uuid4


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
            engagement_id = await conn.fetchval(
                """
                INSERT INTO engagements (
                  family_id, engagement_type, status, lead_consultant_id,
                  default_hourly_rate
                )
                VALUES ($1, 'assessment', 'in_progress', $2, 175.00)
                RETURNING id
                """,
                family_id, user_id,
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
