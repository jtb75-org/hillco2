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
    assert body["role"] == "consultant"


async def test_invalid_session_treated_as_unauthenticated(client):
    """Bogus signature on the cookie -> SessionMiddleware silently drops it
    -> /api/me returns 401, not 500. Regression-guard for any future
    middleware re-ordering."""
    client.cookies.set("session", "totally-not-a-valid-signed-cookie")
    r = await client.get("/api/me")
    assert r.status_code == 401
