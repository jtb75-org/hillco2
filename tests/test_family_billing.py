"""Family billing — now living on parents (migration 0007).

Migration 0004 first put four billing_* columns on the families table
as overrides. 0007 moved billing onto whichever parent is flagged
is_billing_contact (with optional billing_address / billing_attention_to
overrides on that parent), because billing always reduces to a person —
the family-level columns were duplicating the parent's data.

Coverage:
  - Family POST/PATCH no longer accept billing_* (they're gone)
  - ParentCreate / Update accept is_billing_contact + the two address
    overrides
  - family_detail surfaces primary_parent_id + billing_parent_id
  - Partial UNIQUE on parents (family_id) WHERE is_billing_contact
    rejects two billing contacts even if the route check is bypassed
  - Successive POSTs with is_billing_contact=True work because the
    route demotes the previous holder in the same transaction
  - is_primary_contact and is_billing_contact are independent
"""
from uuid import uuid4

import asyncpg
import pytest

# ---- Family POST no longer takes billing fields ------------------------

async def test_create_family_succeeds_with_just_household(authed_client):
    r = await authed_client.post("/api/families", json={
        "household_name": f"Plain-{uuid4()}",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["household_name"].startswith("Plain-")
    # billing_* columns are gone from the family row.
    for k in ("billing_name", "billing_email", "billing_attention_to", "billing_address"):
        assert k not in body


async def test_family_extra_billing_fields_are_silently_ignored(authed_client):
    """Pydantic default extra='ignore' — passing legacy billing_* fields
    in the request body shouldn't cause a 422; they just don't land
    anywhere."""
    r = await authed_client.post("/api/families", json={
        "household_name": f"Legacy-{uuid4()}",
        "billing_name": "Trust",
        "billing_email": "trust@example.com",
    })
    assert r.status_code == 201


# ---- Parent POST with billing fields -----------------------------------

async def test_create_parent_with_billing_contact_and_address(authed_client):
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"Bill-{uuid4()}",
    })).json()["id"]
    r = await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Trust Account",
        "email": "trust@example.com",
        "role": "other",
        "is_billing_contact": True,
        "billing_address": "1 Main St\nSpringfield, IL 62701",
        "billing_attention_to": "Jane Doe, CPA",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_billing_contact"] is True
    assert body["billing_address"].startswith("1 Main St")
    assert body["billing_attention_to"] == "Jane Doe, CPA"


async def test_billing_address_blank_normalizes_to_null(authed_client):
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"Trim-{uuid4()}",
    })).json()["id"]
    pid = (await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Test",
        "billing_address": "  ",
    })).json()["id"]

    r = await authed_client.patch(f"/api/parents/{pid}", json={"billing_address": ""})
    assert r.json()["billing_address"] is None


# ---- Detail rollup -----------------------------------------------------

async def test_family_detail_returns_primary_and_billing_parent_ids(authed_client):
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"Roles-{uuid4()}",
    })).json()["id"]
    mom = await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Mom", "is_primary_contact": True,
    })
    dad = await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Dad", "is_billing_contact": True,
    })
    detail = await authed_client.get(f"/api/families/{fid}")
    body = detail.json()
    assert body["primary_parent_id"] == mom.json()["id"]
    assert body["billing_parent_id"] == dad.json()["id"]


async def test_same_parent_can_be_both_primary_and_billing(authed_client):
    """The 90% case: one parent does both."""
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"Both-{uuid4()}",
    })).json()["id"]
    p = await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Solo Parent",
        "is_primary_contact": True,
        "is_billing_contact": True,
    })
    detail = (await authed_client.get(f"/api/families/{fid}")).json()
    assert detail["primary_parent_id"] == p.json()["id"]
    assert detail["billing_parent_id"] == p.json()["id"]


async def test_billing_parent_id_null_when_unset(authed_client):
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"NoBill-{uuid4()}",
    })).json()["id"]
    await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Generic",
    })
    detail = (await authed_client.get(f"/api/families/{fid}")).json()
    assert detail["billing_parent_id"] is None


# ---- Partial unique invariants -----------------------------------------

async def test_db_rejects_two_billing_contacts_per_family(db_pool):
    """Belt-and-braces against the new family_guardians junction:
    partial UNIQUE on (family_id) WHERE is_billing_contact must reject
    a second billing contact even if the route layer is bypassed."""
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"DupBill-{uuid4()}",
        )
        p1 = await conn.fetchval(
            "INSERT INTO people (kind, first_name) VALUES ('guardian', 'A') RETURNING id"
        )
        p2 = await conn.fetchval(
            "INSERT INTO people (kind, first_name) VALUES ('guardian', 'B') RETURNING id"
        )
        await conn.execute(
            "INSERT INTO family_guardians (family_id, person_id, is_billing_contact) VALUES ($1, $2, TRUE)",
            family_id, p1,
        )
        with pytest.raises(asyncpg.UniqueViolationError):
            await conn.execute(
                "INSERT INTO family_guardians (family_id, person_id, is_billing_contact) VALUES ($1, $2, TRUE)",
                family_id, p2,
            )


async def test_db_allows_zero_billing_contacts_per_family(db_pool):
    """Partial unique only constrains TRUE rows. Multiple non-billing
    guardians are fine on the family_guardians junction."""
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"NoBill-{uuid4()}",
        )
        for label in ("A", "B"):
            person_id = await conn.fetchval(
                "INSERT INTO people (kind, first_name) VALUES ('guardian', $1) RETURNING id",
                label,
            )
            await conn.execute(
                "INSERT INTO family_guardians (family_id, person_id, is_billing_contact) VALUES ($1, $2, FALSE)",
                family_id, person_id,
            )


async def test_route_demotion_handles_successive_billing_promotions(authed_client):
    """The route demotes any existing billing parent before promoting
    a new one, so successive POSTs with is_billing_contact=True don't
    trip the partial UNIQUE."""
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"Promote-{uuid4()}",
    })).json()["id"]
    a = await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "First", "is_billing_contact": True,
    })
    b = await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Second", "is_billing_contact": True,
    })
    assert a.status_code == 201
    assert b.status_code == 201
    detail = (await authed_client.get(f"/api/families/{fid}")).json()
    assert detail["billing_parent_id"] == b.json()["id"]


async def test_patch_billing_contact_demotes_previous(authed_client):
    """PATCH path: flipping is_billing_contact=True on parent B should
    demote A's flag, not collide with the partial UNIQUE."""
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"PatchPromote-{uuid4()}",
    })).json()["id"]
    a = (await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Old Bill", "is_billing_contact": True,
    })).json()
    b = (await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "New Bill",
    })).json()

    r = await authed_client.patch(f"/api/parents/{b['id']}", json={
        "is_billing_contact": True,
    })
    assert r.status_code == 200, r.text

    parents = (await authed_client.get(f"/api/families/{fid}")).json()["parents"]
    flags = {p["id"]: p["is_billing_contact"] for p in parents}
    assert flags[a["id"]] is False
    assert flags[b["id"]] is True


# ---- Schema-level: billing_* really gone from families -----------------

async def test_families_table_no_longer_has_billing_columns(db_pool):
    async with db_pool.acquire() as conn:
        cols = {
            r["column_name"] for r in await conn.fetch(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'families'
                """
            )
        }
    for gone in ("billing_name", "billing_email", "billing_attention_to", "billing_address"):
        assert gone not in cols


async def test_family_guardians_has_billing_columns(db_pool):
    """After the spine flip + collapse, guardian-side billing data
    lives on family_guardians (the flag) plus people (billing_address
    + billing_attention_to overrides). The legacy `parents` table is
    gone."""
    async with db_pool.acquire() as conn:
        fg_cols = {
            r["column_name"] for r in await conn.fetch(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'family_guardians'
                """
            )
        }
        people_cols = {
            r["column_name"] for r in await conn.fetch(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'people'
                """
            )
        }
    assert "is_billing_contact" in fg_cols
    assert "is_primary_contact" in fg_cols
    assert "billing_attention_to" in people_cols
    assert "billing_street1" in people_cols
