"""Family billing rollup (migration 0004).

Locks in:
  - billing_* columns round-trip through POST and PATCH
  - family_detail surfaces billing_primary_parent_id derived from the
    primary parent
  - the partial UNIQUE index on parents (family_id) WHERE is_primary_contact
    rejects a second primary even when the route's app-level demotion is
    bypassed
"""
from uuid import uuid4

import asyncpg
import pytest

# ---- Family billing fields ----------------------------------------------

async def test_create_family_with_billing_fields(authed_client):
    r = await authed_client.post("/api/families", json={
        "household_name": f"Bill-{uuid4()}",
        "billing_name": "Smith Family Trust",
        "billing_email": "billing@smith.example",
        "billing_attention_to": "Jane Doe, CPA",
        "billing_address": "1 Main St, Springfield, IL 62701",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["billing_name"] == "Smith Family Trust"
    assert body["billing_email"] == "billing@smith.example"
    assert body["billing_attention_to"] == "Jane Doe, CPA"
    assert body["billing_address"].startswith("1 Main St")


async def test_create_family_without_billing_fields_returns_nulls(authed_client):
    r = await authed_client.post("/api/families", json={
        "household_name": f"Plain-{uuid4()}",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["billing_name"] is None
    assert body["billing_email"] is None


async def test_patch_family_billing_fields(authed_client):
    create = await authed_client.post("/api/families", json={
        "household_name": f"Patch-{uuid4()}",
    })
    fid = create.json()["id"]

    r = await authed_client.patch(f"/api/families/{fid}", json={
        "billing_name": "New Trust",
        "billing_address": "PO Box 42",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["billing_name"] == "New Trust"
    assert body["billing_address"] == "PO Box 42"

    # blanking a field stores NULL, not the empty string.
    r2 = await authed_client.patch(f"/api/families/{fid}", json={"billing_name": ""})
    assert r2.json()["billing_name"] is None


async def test_billing_email_is_case_insensitive_via_citext(db_pool, authed_client):
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"Citext-{uuid4()}",
        "billing_email": "Mixed.Case@Example.COM",
    })).json()["id"]
    async with db_pool.acquire() as conn:
        match = await conn.fetchval(
            "SELECT 1 FROM families WHERE id = $1 AND billing_email = $2",
            fid, "mixed.case@example.com",
        )
    assert match == 1


# ---- billing_primary_parent_id derivation -------------------------------

async def test_family_detail_surfaces_primary_parent_id(authed_client):
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"Primary-{uuid4()}",
    })).json()["id"]

    a = await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Mom", "is_primary_contact": True,
    })
    await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Dad", "is_primary_contact": False,
    })

    detail = await authed_client.get(f"/api/families/{fid}")
    assert detail.json()["billing_primary_parent_id"] == a.json()["id"]


async def test_family_detail_primary_parent_id_is_null_when_unset(authed_client):
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"NoPrimary-{uuid4()}",
    })).json()["id"]
    await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Solo", "is_primary_contact": False,
    })
    detail = await authed_client.get(f"/api/families/{fid}")
    assert detail.json()["billing_primary_parent_id"] is None


# ---- Partial unique index ----------------------------------------------

async def test_db_rejects_two_primaries_per_family(db_pool):
    """Belt-and-braces: even if the route's demote-others step is
    bypassed, the partial UNIQUE index must reject a second primary."""
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"DupPrimary-{uuid4()}",
        )
        await conn.execute(
            "INSERT INTO parents (family_id, name, is_primary_contact) VALUES ($1, 'A', TRUE)",
            family_id,
        )
        with pytest.raises(asyncpg.UniqueViolationError):
            await conn.execute(
                "INSERT INTO parents (family_id, name, is_primary_contact) VALUES ($1, 'B', TRUE)",
                family_id,
            )


async def test_db_allows_zero_primaries_per_family(db_pool):
    """Partial unique only constrains when is_primary_contact is TRUE.
    Multiple non-primaries are fine (covers the 'no billing contact set
    yet' state)."""
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"NoPrim-{uuid4()}",
        )
        await conn.execute(
            "INSERT INTO parents (family_id, name, is_primary_contact) VALUES ($1, 'A', FALSE)",
            family_id,
        )
        await conn.execute(
            "INSERT INTO parents (family_id, name, is_primary_contact) VALUES ($1, 'B', FALSE)",
            family_id,
        )
    # No exception = pass.


async def test_route_demotion_still_works_with_partial_unique(authed_client):
    """The route demotes any existing primary before promoting a new one,
    so successive `is_primary_contact: True` POSTs land cleanly under
    the new index."""
    fid = (await authed_client.post("/api/families", json={
        "household_name": f"Demote-{uuid4()}",
    })).json()["id"]
    a = await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "First", "is_primary_contact": True,
    })
    b = await authed_client.post(f"/api/families/{fid}/parents", json={
        "name": "Second", "is_primary_contact": True,
    })
    assert a.status_code == 201
    assert b.status_code == 201

    detail = await authed_client.get(f"/api/families/{fid}")
    assert detail.json()["billing_primary_parent_id"] == b.json()["id"]
