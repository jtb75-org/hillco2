"""Auth boundary: every /api/* path is 401-gated, /health isn't."""
import pytest

# Sample of routes across domains. Doesn't need to be exhaustive; the
# auth check lives in a single place (require_user dependency) so any
# new route inherits it. This list is here so a future change that
# *removes* the dependency from one route shows up loudly.
SAMPLE_API_PATHS = [
    "/api/me",
    "/api/families",
    "/api/students/00000000-0000-0000-0000-000000000000",
    "/api/schools",
    "/api/contacts",
    "/api/engagements",
    "/api/invoices",
    "/api/dashboard",
    "/api/catalog/phases",
    "/api/catalog/items",
    "/api/documents",
]


@pytest.mark.parametrize("path", SAMPLE_API_PATHS)
async def test_api_requires_session(client, path):
    r = await client.get(path)
    assert r.status_code == 401, f"{path} returned {r.status_code}; expected 401"
    assert r.json() == {"detail": "Authentication required"}


async def test_health_no_auth_required(client):
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "build" in body


async def test_me_returns_user_when_authenticated(authed_client, test_user):
    r = await authed_client.get("/api/me")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == str(test_user["id"])
    assert body["email"] == test_user["email"]
    assert body["role"] == "admin"


async def test_invalid_session_treated_as_unauthenticated(client):
    """Bogus signature on the cookie -> SessionMiddleware silently drops it
    -> /api/me returns 401, not 500. Regression-guard for any future
    middleware re-ordering."""
    client.cookies.set("session", "totally-not-a-valid-signed-cookie")
    r = await client.get("/api/me")
    assert r.status_code == 401


async def test_e2e_auth_bypass_disabled_by_default(client):
    """The E2E header does nothing unless the explicit non-prod flag is on."""
    r = await client.get("/api/me", headers={"x-hillco2-e2e-auth": "test-token"})
    assert r.status_code == 401


async def test_e2e_auth_bypass_mints_normal_session(client, monkeypatch):
    """When enabled, the E2E header mints a normal session cookie."""
    from app.config import settings  # noqa: PLC0415

    monkeypatch.setattr(settings, "e2e_auth_bypass_enabled", True)
    monkeypatch.setattr(settings, "e2e_auth_bypass_token", "test-token")
    monkeypatch.setattr(settings, "e2e_auth_email", "browser-e2e@example.com")
    monkeypatch.setattr(settings, "e2e_auth_name", "Browser E2E")
    monkeypatch.setattr(settings, "e2e_auth_role", "admin")

    first = await client.get(
        "/api/me",
        headers={"x-hillco2-e2e-auth": "test-token"},
    )
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["email"] == "browser-e2e@example.com"
    assert body["name"] == "Browser E2E"
    assert body["role"] == "admin"

    # The bypass wrote the standard signed session cookie, so follow-up
    # requests do not need the test header.
    second = await client.get("/api/me")
    assert second.status_code == 200, second.text
    assert second.json()["id"] == body["id"]


async def test_e2e_auth_bypass_rejects_wrong_token(client, monkeypatch):
    """Enabled bypass still requires the configured shared token."""
    from app.config import settings  # noqa: PLC0415

    monkeypatch.setattr(settings, "e2e_auth_bypass_enabled", True)
    monkeypatch.setattr(settings, "e2e_auth_bypass_token", "test-token")
    monkeypatch.setattr(settings, "e2e_auth_email", "browser-e2e@example.com")

    r = await client.get("/api/me", headers={"x-hillco2-e2e-auth": "wrong"})
    assert r.status_code == 401
