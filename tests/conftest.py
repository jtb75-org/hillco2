"""Test fixtures for hillco2.

The strategy is integration-shaped: spin up the real FastAPI app against a
real Postgres (TEST_DATABASE_URL), apply alembic migrations + seed_catalog.sql
once per session, and exercise endpoints over httpx's ASGI transport.
Tests create their own data with uuid4-named records so they don't need
per-test transaction rollback for isolation.

Set TEST_DATABASE_URL before running, e.g.:

    TEST_DATABASE_URL=postgresql://postgres@localhost:5432/hillco2_test pytest

The DB pointed at by TEST_DATABASE_URL gets its `public` schema
DROPPED and re-created at session start. Don't aim it at anything you
care about.
"""
import asyncio
import base64
import json
import os
from pathlib import Path
from uuid import uuid4

import asyncpg
import httpx
import itsdangerous
import pytest
import pytest_asyncio
from alembic.config import Config

from alembic import command

REPO_ROOT = Path(__file__).resolve().parent.parent

# Env vars need to land before app modules import (pydantic-settings reads
# at Settings() construction time).
os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get("TEST_DATABASE_URL", "postgresql://postgres@localhost:5432/hillco2_test"),
)
os.environ.setdefault("SESSION_SECRET", "test-only-not-for-prod-aaaaaaaaaaaaaaaaaaaa")
os.environ.setdefault("SESSION_HTTPS_ONLY", "false")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("ALLOWED_EMAILS", "test@example.com")


def _alembic_config() -> Config:
    """Build an Alembic Config that env.py can find. env.py reads
    DATABASE_URL from os.environ, which we've already set above."""
    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    # script_location is relative to alembic.ini in the file, but alembic
    # resolves it relative to the ini's directory only if the file has
    # been loaded — explicit override here is robust against test cwd
    # quirks.
    cfg.set_main_option("script_location", str(REPO_ROOT / "alembic"))
    return cfg


@pytest_asyncio.fixture(scope="session")
async def applied_schema():
    """Drop+recreate public schema, run `alembic upgrade head`, then
    apply seed_catalog.sql. Yields the database URL the app modules
    will reuse."""
    test_url = os.environ["DATABASE_URL"]

    conn = await asyncpg.connect(test_url)
    try:
        await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    finally:
        await conn.close()

    # Alembic is sync; run it on a worker thread so we don't block the
    # event loop. env.py reads DATABASE_URL from os.environ.
    cfg = _alembic_config()
    await asyncio.to_thread(command.upgrade, cfg, "head")

    # seed_catalog.sql stays as a separate idempotent step (per the
    # alembic plan: schema and seed have different update semantics).
    conn = await asyncpg.connect(test_url)
    try:
        await conn.execute((REPO_ROOT / "seed_catalog.sql").read_text())
    finally:
        await conn.close()

    yield test_url


@pytest_asyncio.fixture(scope="session")
async def db_pool(applied_schema):
    pool = await asyncpg.create_pool(applied_schema, min_size=1, max_size=5)
    yield pool
    await pool.close()


@pytest_asyncio.fixture(autouse=True)
async def _wire_app_pool(db_pool, monkeypatch):
    """Make the FastAPI app use our test pool. Imported lazily so the env
    vars set above are in scope when the settings module first loads."""
    from app import db as db_mod  # noqa: PLC0415
    monkeypatch.setattr(db_mod.db, "pool", db_pool)
    yield


# ---- Test users / sessions -------------------------------------------------

@pytest_asyncio.fixture
async def test_user(db_pool):
    """Insert a fresh user; return id/email/name as a dict."""
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (email, name, role, is_active)
            VALUES ($1, 'Test User', 'consultant', TRUE)
            RETURNING id, email, name, role, is_active
            """,
            f"test-{uuid4()}@example.com",
        )
    return dict(row)


def _sign_session_cookie(session_data: dict) -> str:
    """Mirror starlette's SessionMiddleware: base64-json the data, then sign
    with itsdangerous.TimestampSigner. The server's middleware verifies
    against the same SESSION_SECRET we set in env."""
    data = base64.b64encode(json.dumps(session_data).encode()).decode()
    signer = itsdangerous.TimestampSigner(os.environ["SESSION_SECRET"])
    return signer.sign(data).decode()


@pytest.fixture
def session_cookie_for(test_user):
    """Builds a session cookie value for an arbitrary user dict."""
    def _make(user=None):
        u = user or test_user
        return _sign_session_cookie({
            "user_id": str(u["id"]),
            "user_email": u["email"],
            "user_name": u["name"],
        })
    return _make


# ---- httpx clients ---------------------------------------------------------

# httpx doesn't set Origin on its own; the CSRF middleware blocks
# state-changing requests without it. Setting it to match base_url
# satisfies the same-origin check the SPA's fetch() would naturally pass.
_TEST_BASE_URL = "http://testserver"
_TEST_HEADERS = {"Origin": _TEST_BASE_URL}


@pytest_asyncio.fixture
async def client():
    """Unauthenticated client. Use for negative auth tests."""
    from app.main import app  # noqa: PLC0415
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url=_TEST_BASE_URL, headers=_TEST_HEADERS,
    ) as c:
        yield c


@pytest_asyncio.fixture
async def authed_client(session_cookie_for):
    """Client with a valid session cookie for `test_user`. Real OAuth bypassed
    by signing a session cookie directly — same code path the SessionMiddleware
    would have produced after a successful Google callback."""
    from app.main import app  # noqa: PLC0415
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url=_TEST_BASE_URL, headers=_TEST_HEADERS,
    ) as c:
        c.cookies.set("session", session_cookie_for())
        yield c
