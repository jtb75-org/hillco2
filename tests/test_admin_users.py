"""Admin user-management endpoints: create / deactivate / reactivate.

Integration-shaped: real Postgres, real session cookie, real route logic
(only OAuth is bypassed). Each test creates uuid4-named users so they
don't collide with other tests' fixtures or each other.
"""
from uuid import uuid4

import pytest


async def test_create_user_succeeds(authed_client):
    email = f"new-{uuid4()}@example.com"
    r = await authed_client.post("/api/admin/users", json={
        "email": email,
        "name": "Pat Newhire",
        "role": "consultant",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == email
    assert body["name"] == "Pat Newhire"
    assert body["role"] == "consultant"
    assert body["is_active"] is True
    assert body["last_login_at"] is None


async def test_create_user_strips_whitespace(authed_client):
    email = f"trim-{uuid4()}@example.com"
    r = await authed_client.post("/api/admin/users", json={
        "email": f"  {email}  ",
        "name": "  Pat  ",
        "role": "assistant",
    })
    assert r.status_code == 201, r.text
    assert r.json()["email"] == email
    assert r.json()["name"] == "Pat"


async def test_create_user_duplicate_email_returns_409(authed_client, test_user):
    r = await authed_client.post("/api/admin/users", json={
        "email": test_user["email"],
        "name": "Doppelganger",
        "role": "consultant",
    })
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"].lower()


async def test_create_user_duplicate_email_case_insensitive(authed_client, test_user):
    """email is CITEXT — case differences must still collide."""
    r = await authed_client.post("/api/admin/users", json={
        "email": test_user["email"].upper(),
        "name": "Shouty Variant",
        "role": "consultant",
    })
    assert r.status_code == 409


@pytest.mark.parametrize("role", ["", "guest", "Consultant", "ADMIN"])
async def test_create_user_rejects_unknown_role(authed_client, role):
    r = await authed_client.post("/api/admin/users", json={
        "email": f"r-{uuid4()}@example.com",
        "name": "Test",
        "role": role,
    })
    assert r.status_code == 422


@pytest.mark.parametrize("email", ["nope", "no-at-sign", "@bare.com", "trail@"])
async def test_create_user_rejects_garbage_email(authed_client, email):
    r = await authed_client.post("/api/admin/users", json={
        "email": email,
        "name": "Test",
        "role": "consultant",
    })
    assert r.status_code == 422


async def test_create_user_requires_session(client):
    r = await client.post("/api/admin/users", json={
        "email": "x@example.com",
        "name": "x",
        "role": "consultant",
    })
    assert r.status_code == 401


async def test_deactivate_user_sets_is_active_false(authed_client, db_pool):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO users (email, name, role) VALUES ($1, 'Tmp', 'consultant') RETURNING id",
            f"deact-{uuid4()}@example.com",
        )
    target_id = str(row["id"])

    r = await authed_client.delete(f"/api/admin/users/{target_id}")
    assert r.status_code == 200, r.text
    assert r.json()["is_active"] is False

    async with db_pool.acquire() as conn:
        actual = await conn.fetchval("SELECT is_active FROM users WHERE id = $1", row["id"])
    assert actual is False


async def test_deactivate_self_returns_400(authed_client, test_user):
    r = await authed_client.delete(f"/api/admin/users/{test_user['id']}")
    assert r.status_code == 400
    assert "cannot deactivate your own account" in r.json()["detail"].lower()


async def test_deactivate_unknown_user_returns_404(authed_client):
    r = await authed_client.delete(f"/api/admin/users/{uuid4()}")
    assert r.status_code == 404


async def test_reactivate_user_sets_is_active_true(authed_client, db_pool):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO users (email, name, role, is_active) VALUES ($1, 'Tmp', 'consultant', FALSE) RETURNING id",
            f"react-{uuid4()}@example.com",
        )
    target_id = str(row["id"])

    r = await authed_client.post(f"/api/admin/users/{target_id}/reactivate")
    assert r.status_code == 200, r.text
    assert r.json()["is_active"] is True

    async with db_pool.acquire() as conn:
        actual = await conn.fetchval("SELECT is_active FROM users WHERE id = $1", row["id"])
    assert actual is True


async def test_reactivate_unknown_user_returns_404(authed_client):
    r = await authed_client.post(f"/api/admin/users/{uuid4()}/reactivate")
    assert r.status_code == 404


async def test_deactivate_writes_audit_log(authed_client, db_pool, test_user):
    """Soft-delete is an UPDATE on users; the existing audit_trigger
    should record it with the acting user's id from app.user_id."""
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO users (email, name, role) VALUES ($1, 'Tmp', 'consultant') RETURNING id",
            f"audit-{uuid4()}@example.com",
        )
    target_id = row["id"]

    r = await authed_client.delete(f"/api/admin/users/{target_id}")
    assert r.status_code == 200

    async with db_pool.acquire() as conn:
        entries = await conn.fetch(
            "SELECT user_id, action FROM audit_log WHERE table_name = 'users' AND row_id = $1 ORDER BY id DESC",
            target_id,
        )
    # The INSERT above ran without a session, so app.user_id is empty
    # for that row's audit entry; the DELETE-via-soft-delete UPDATE
    # is the one that should be attributed to test_user.
    update_entries = [e for e in entries if e["action"] == "UPDATE"]
    assert update_entries, "expected an UPDATE audit entry for the soft-delete"
    assert update_entries[0]["user_id"] == test_user["id"]
