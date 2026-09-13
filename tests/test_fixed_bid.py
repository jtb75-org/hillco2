"""Fixed-bid billing (Phase 1): billing_mode + fixed fee on engagement
types, snapshotted onto engagements, canonical contract amount, template
auto-selection by mode, and the minimal fixed-fee invoice affordance.

Everything creates its own engagement types with unique codes so it never
mutates the shared baseline types other tests depend on.
"""
import json
from uuid import uuid4

import pytest


def _vars(agreement: dict) -> dict:
    """agreements return `variables` as a JSON string over the wire."""
    v = agreement["variables"]
    return json.loads(v) if isinstance(v, str) else v


@pytest.fixture
async def family_with_student(db_pool, test_user):
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('app.user_id', $1, true)", str(test_user["id"])
            )
            family_id = await conn.fetchval(
                "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
                f"FixedBid-{uuid4()}",
            )
            student_id = await conn.fetchval(
                "INSERT INTO people (kind, first_name) VALUES ('student','Fixed Kid') RETURNING id"
            )
            await conn.execute(
                "INSERT INTO family_students (family_id, person_id) VALUES ($1,$2)",
                family_id, student_id,
            )
            await conn.execute(
                "INSERT INTO student_details (person_id) VALUES ($1)", student_id
            )
    return {"family_id": str(family_id), "student_id": str(student_id)}


async def _new_type(authed_client, *, billing_mode, fee=None):
    code = "t_" + uuid4().hex[:12]
    r = await authed_client.post(
        "/api/engagement-types",
        json={
            "code": code,
            "label": code,
            "billing_mode": billing_mode,
            "default_fixed_fee": fee,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---- engagement types ----------------------------------------------------

async def test_type_fixed_roundtrips_price(authed_client):
    t = await _new_type(authed_client, billing_mode="fixed", fee="2500.00")
    assert t["billing_mode"] == "fixed"
    assert float(t["default_fixed_fee"]) == 2500.00


async def test_type_hourly_nulls_price(authed_client):
    # An hourly type ignores/normalizes away a submitted price.
    t = await _new_type(authed_client, billing_mode="hourly", fee="999.00")
    assert t["billing_mode"] == "hourly"
    assert t["default_fixed_fee"] is None


async def test_type_fixed_without_price_rejected(authed_client):
    r = await authed_client.post(
        "/api/engagement-types",
        json={"code": "t_" + uuid4().hex[:8], "label": "x", "billing_mode": "fixed"},
    )
    assert r.status_code == 400, r.text


# ---- snapshot at engagement creation -------------------------------------

async def test_direct_engagement_snapshots_type_billing(authed_client, family_with_student):
    t = await _new_type(authed_client, billing_mode="fixed", fee="3000.00")
    r = await authed_client.post(
        f"/api/families/{family_with_student['family_id']}/engagements",
        json={"student_id": family_with_student["student_id"], "engagement_type": t["code"]},
    )
    assert r.status_code == 201, r.text
    eng = r.json()
    assert eng["billing_mode"] == "fixed"
    assert float(eng["fixed_fee"]) == 3000.00


async def test_type_price_change_does_not_mutate_existing_engagement(
    authed_client, family_with_student
):
    t = await _new_type(authed_client, billing_mode="fixed", fee="3000.00")
    eng = (await authed_client.post(
        f"/api/families/{family_with_student['family_id']}/engagements",
        json={"student_id": family_with_student["student_id"], "engagement_type": t["code"]},
    )).json()

    # Bump the type's default price afterward.
    await authed_client.patch(
        f"/api/engagement-types/{t['id']}", json={"default_fixed_fee": "9999.00"}
    )

    fresh = (await authed_client.get(f"/api/engagements/{eng['id']}")).json()
    assert float(fresh["fixed_fee"]) == 3000.00  # snapshot unchanged


# ---- contract amount is canonical ----------------------------------------

async def test_fixed_contract_defaults_amount_from_fixed_fee(
    authed_client, family_with_student
):
    t = await _new_type(authed_client, billing_mode="fixed", fee="4200.00")
    eng = (await authed_client.post(
        f"/api/families/{family_with_student['family_id']}/engagements",
        json={"student_id": family_with_student["student_id"], "engagement_type": t["code"]},
    )).json()

    ag = (await authed_client.post(
        f"/api/engagements/{eng['id']}/agreements",
        json={"type": "services_contract"},
    )).json()
    assert float(ag["amount"]) == 4200.00


async def test_fixed_contract_blocked_without_fee(authed_client, family_with_student):
    t = await _new_type(authed_client, billing_mode="fixed", fee="4200.00")
    eng = (await authed_client.post(
        f"/api/families/{family_with_student['family_id']}/engagements",
        json={"student_id": family_with_student["student_id"], "engagement_type": t["code"]},
    )).json()
    # Clear the engagement's fee → contract create must refuse.
    await authed_client.patch(f"/api/engagements/{eng['id']}", json={"fixed_fee": None})
    r = await authed_client.post(
        f"/api/engagements/{eng['id']}/agreements", json={"type": "services_contract"},
    )
    assert r.status_code == 400, r.text


# ---- template auto-selection by mode -------------------------------------

async def test_template_billing_mode_ordering_prefers_exact_match(authed_client):
    r = await authed_client.get(
        "/api/contract-templates?kind=services_contract&billing_mode=fixed"
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    # The seeded fixed template must sort ahead of the hourly one.
    modes = [row["billing_mode"] for row in rows]
    assert "fixed" in modes and modes[0] == "fixed"


# ---- minimal fixed-fee invoice -------------------------------------------

async def test_fixed_fee_invoice_creates_one_line(authed_client, family_with_student):
    t = await _new_type(authed_client, billing_mode="fixed", fee="5000.00")
    eng = (await authed_client.post(
        f"/api/families/{family_with_student['family_id']}/engagements",
        json={"student_id": family_with_student["student_id"], "engagement_type": t["code"]},
    )).json()

    r = await authed_client.post(
        f"/api/engagements/{eng['id']}/invoices/fixed-fee", json={},
    )
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["status"] == "draft"
    assert len(inv["line_items"]) == 1
    assert float(inv["line_items"][0]["line_total"]) == 5000.00
    assert inv["line_items"][0]["source_type"] == "custom"
    assert float(inv["total"]) == 5000.00


async def test_fixed_fee_invoice_rejects_hourly_engagement(authed_client, family_with_student):
    t = await _new_type(authed_client, billing_mode="hourly")
    eng = (await authed_client.post(
        f"/api/families/{family_with_student['family_id']}/engagements",
        json={"student_id": family_with_student["student_id"], "engagement_type": t["code"]},
    )).json()
    r = await authed_client.post(
        f"/api/engagements/{eng['id']}/invoices/fixed-fee", json={},
    )
    assert r.status_code == 400, r.text


# ---- time logging on fixed vs hourly -------------------------------------

async def _engagement_of_type(authed_client, fam, billing_mode, fee=None):
    t = await _new_type(authed_client, billing_mode=billing_mode, fee=fee)
    return (await authed_client.post(
        f"/api/families/{fam['family_id']}/engagements",
        json={"student_id": fam["student_id"], "engagement_type": t["code"]},
    )).json()


async def test_time_on_fixed_engagement_defaults_nonbillable(authed_client, family_with_student):
    eng = await _engagement_of_type(authed_client, family_with_student, "fixed", "3000")
    r = await authed_client.post(
        f"/api/engagements/{eng['id']}/time-entries", json={"hours": "1.5"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["billable"] is False


async def test_time_on_hourly_engagement_defaults_billable(authed_client, family_with_student):
    eng = await _engagement_of_type(authed_client, family_with_student, "hourly")
    r = await authed_client.post(
        f"/api/engagements/{eng['id']}/time-entries", json={"hours": "1.5"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["billable"] is True


async def test_time_explicit_billable_honored_on_fixed(authed_client, family_with_student):
    eng = await _engagement_of_type(authed_client, family_with_student, "fixed", "3000")
    r = await authed_client.post(
        f"/api/engagements/{eng['id']}/time-entries",
        json={"hours": "1.0", "billable": True},
    )
    assert r.status_code == 201, r.text
    assert r.json()["billable"] is True


# ---- dynamic scope-of-services -------------------------------------------

async def test_agreement_freezes_engagement_scope(authed_client, family_with_student):
    """A services contract snapshots the engagement's activities into the
    scope_of_services variable at create time, phase-grouped as markdown."""
    eng = await _engagement_of_type(authed_client, family_with_student, "fixed", "3000")
    for title, desc in [
        ("Records review", "Read IEPs and evaluations"),
        ("School tour", None),
    ]:
        r = await authed_client.post(
            f"/api/engagements/{eng['id']}/tasks",
            json={"title": title, "description": desc},
        )
        assert r.status_code == 201, r.text

    ag = (await authed_client.post(
        f"/api/engagements/{eng['id']}/agreements",
        json={"type": "services_contract"},
    )).json()
    scope = _vars(ag)["scope_of_services"]
    assert "- **Records review** — Read IEPs and evaluations" in scope
    assert "- **School tour**" in scope
    # No description → no dangling em-dash.
    assert "School tour** —" not in scope


async def test_agreement_scope_empty_when_no_activities(authed_client, family_with_student):
    eng = await _engagement_of_type(authed_client, family_with_student, "fixed", "3000")
    ag = (await authed_client.post(
        f"/api/engagements/{eng['id']}/agreements",
        json={"type": "services_contract"},
    )).json()
    assert "No activities" in _vars(ag)["scope_of_services"]


async def test_agreement_scope_frozen_against_later_task_changes(
    authed_client, family_with_student
):
    """Scope is snapshotted at create — adding activities afterward must
    not retroactively change an existing agreement's frozen scope."""
    eng = await _engagement_of_type(authed_client, family_with_student, "fixed", "3000")
    await authed_client.post(
        f"/api/engagements/{eng['id']}/tasks", json={"title": "Original"},
    )
    ag = (await authed_client.post(
        f"/api/engagements/{eng['id']}/agreements",
        json={"type": "services_contract"},
    )).json()
    await authed_client.post(
        f"/api/engagements/{eng['id']}/tasks", json={"title": "Added later"},
    )
    fresh = (await authed_client.get(f"/api/agreements/{ag['id']}")).json()
    vars_ = _vars(fresh)
    assert "Original" in vars_["scope_of_services"]
    assert "Added later" not in vars_["scope_of_services"]


# ---- partial fixed-fee billing (drawdown) ---------------------------------

async def test_fixed_fee_partial_then_balance(authed_client, family_with_student):
    eng = await _engagement_of_type(authed_client, family_with_student, "fixed", "1000")

    # 50% deposit.
    dep = (await authed_client.post(
        f"/api/engagements/{eng['id']}/invoices/fixed-fee", json={"amount": "400"},
    )).json()
    assert float(dep["total"]) == 400.0

    # Balance (amount omitted → bill the remaining 600).
    bal = (await authed_client.post(
        f"/api/engagements/{eng['id']}/invoices/fixed-fee", json={},
    )).json()
    assert float(bal["total"]) == 600.0

    # Fully invoiced now → further billing is refused.
    r = await authed_client.post(
        f"/api/engagements/{eng['id']}/invoices/fixed-fee", json={},
    )
    assert r.status_code == 400
    assert "fully invoiced" in r.json()["detail"].lower()


async def test_fixed_fee_overbill_rejected(authed_client, family_with_student):
    eng = await _engagement_of_type(authed_client, family_with_student, "fixed", "1000")
    r = await authed_client.post(
        f"/api/engagements/{eng['id']}/invoices/fixed-fee", json={"amount": "1500"},
    )
    assert r.status_code == 400
    assert "exceeds" in r.json()["detail"].lower()


async def test_fixed_fee_voided_invoice_frees_the_balance(authed_client, family_with_student):
    eng = await _engagement_of_type(authed_client, family_with_student, "fixed", "1000")
    inv = (await authed_client.post(
        f"/api/engagements/{eng['id']}/invoices/fixed-fee", json={"amount": "1000"},
    )).json()
    # Void it → the full fee should be billable again.
    await authed_client.post(f"/api/invoices/{inv['id']}/void", json={})
    again = await authed_client.post(
        f"/api/engagements/{eng['id']}/invoices/fixed-fee", json={"amount": "1000"},
    )
    assert again.status_code == 201, again.text
