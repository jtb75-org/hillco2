"""OAuth callback outcomes."""

import base64
import json
from uuid import uuid4

import itsdangerous
import pytest


def _session_cookie_payload(cookie: str) -> dict:
    """Decode Starlette's signed session cookie for assertions."""
    signer = itsdangerous.TimestampSigner("test-only-not-for-prod-aaaaaaaaaaaaaaaaaaaa")
    unsigned = signer.unsign(cookie).decode()
    return json.loads(base64.b64decode(unsigned).decode())


def _patch_allowed_emails(monkeypatch, *emails):
    from app.routes import auth as auth_routes

    monkeypatch.setattr(
        auth_routes.settings,
        "allowed_emails",
        ",".join(emails),
    )


def _patch_oauth_token(monkeypatch, token=None, *, raise_oauth_error=False):
    from app.routes import auth as auth_routes

    async def fake_authorize_access_token(_request):
        if raise_oauth_error:
            raise auth_routes.OAuthError(
                error="invalid_grant",
                description="replayed code",
            )
        return token

    monkeypatch.setattr(
        auth_routes.oauth.google,
        "authorize_access_token",
        fake_authorize_access_token,
    )


async def test_auth_callback_first_time_google_signup_creates_session(
    client, db_pool, monkeypatch
):
    """First-time allowed Google sign-in creates person/auth/identity and session."""
    email = f"new-user-{uuid4()}@example.com"
    _patch_allowed_emails(monkeypatch, email)
    _patch_oauth_token(
        monkeypatch,
        {"userinfo": {"email": email, "name": "New User"}},
    )

    r = await client.get("/auth/callback", follow_redirects=False)

    assert r.status_code == 303
    assert r.headers["location"] == "/"
    session = _session_cookie_payload(client.cookies["session"])
    assert session["user_email"] == email
    assert session["user_name"] == "New User"
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT p.id, a.status, ai.provider_subject
            FROM people p
            JOIN auth a ON a.person_id = p.id
            JOIN auth_identities ai ON ai.person_id = p.id
            WHERE p.email = $1
            """,
            email,
        )
    assert row is not None
    assert str(row["id"]) == session["user_id"]
    assert row["status"] == "active"
    assert row["provider_subject"] == email


async def test_auth_callback_oauth_error_redirects_and_clears_session(
    client, monkeypatch
):
    """Stale or replayed OAuth code redirects with oauth_failed and clears session."""
    client.cookies.set("session", "stale-session-value")
    _patch_oauth_token(
        monkeypatch,
        raise_oauth_error=True,
    )

    r = await client.get("/auth/callback", follow_redirects=False)

    assert r.status_code == 303
    assert r.headers["location"] == "/?login_error=oauth_failed"
    assert "session" not in client.cookies


async def test_auth_callback_deactivated_identity_redirects_without_insert_crash(
    client, db_pool, monkeypatch
):
    """Soft-deleted identity redirects with deactivated instead of unique-crashing."""
    email = f"deactivated-{uuid4()}@example.com"
    _patch_allowed_emails(monkeypatch, email)
    _patch_oauth_token(
        monkeypatch,
        {"userinfo": {"email": email, "name": "Deactivated User"}},
    )
    async with db_pool.acquire() as conn:
        person_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, email, deleted_at)
            VALUES ('other', 'Deactivated', $1, NOW())
            RETURNING id
            """,
            email,
        )
        await conn.execute(
            "INSERT INTO auth (person_id, status, app_role) VALUES ($1, 'active', 'admin')",
            person_id,
        )
        await conn.execute(
            """
            INSERT INTO auth_identities (person_id, provider, provider_subject)
            VALUES ($1, 'google', $2)
            """,
            person_id,
            email,
        )

    r = await client.get("/auth/callback", follow_redirects=False)

    assert r.status_code == 303
    assert r.headers["location"] == "/?login_error=deactivated"


async def test_auth_callback_disallowed_email_redirects_not_allowed(
    client, monkeypatch
):
    """Google email outside allowed_emails redirects with not_allowed."""
    _patch_allowed_emails(monkeypatch, "allowed@example.com")
    _patch_oauth_token(
        monkeypatch,
        {"userinfo": {"email": "outsider@example.com", "name": "Out Sider"}},
    )

    r = await client.get("/auth/callback", follow_redirects=False)

    assert r.status_code == 303
    assert r.headers["location"] == "/?login_error=not_allowed"


@pytest.mark.parametrize("userinfo", [{}, {"name": "No Email"}])
async def test_auth_callback_missing_email_redirects_no_userinfo(
    client, monkeypatch, userinfo
):
    """Missing userinfo email redirects with no_userinfo."""
    _patch_allowed_emails(monkeypatch, "allowed@example.com")
    _patch_oauth_token(monkeypatch, {"userinfo": userinfo})

    r = await client.get("/auth/callback", follow_redirects=False)

    assert r.status_code == 303
    assert r.headers["location"] == "/?login_error=no_userinfo"
