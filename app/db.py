from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

import asyncpg
from fastapi import Request

from .config import settings


class _DB:
    pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self.pool = await asyncpg.create_pool(
            settings.database_url, min_size=1, max_size=10
        )

    async def disconnect(self) -> None:
        if self.pool is not None:
            await self.pool.close()
            self.pool = None


db = _DB()


async def _mint_e2e_session(request: Request) -> None:
    """Create a fixed test user session for browser E2E when enabled."""
    if not settings.e2e_auth_bypass_enabled:
        return
    token = settings.e2e_auth_bypass_token.strip()
    if not token:
        return
    if request.headers.get(settings.e2e_auth_bypass_header) != token:
        return

    email = settings.e2e_auth_email.strip().lower()
    name = settings.e2e_auth_name.strip() or email
    first, _, last = name.partition(" ")
    last = last.strip() or None
    role = settings.e2e_auth_role.strip() or "admin"

    assert db.pool is not None, "DB pool not initialized"
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT p.id
                FROM auth_identities ai
                JOIN people p ON p.id = ai.person_id
                WHERE ai.provider = 'google' AND ai.provider_subject = $1
                """,
                email,
            )
            if row is None:
                person_id = await conn.fetchval(
                    """
                    INSERT INTO people (kind, first_name, last_name, email)
                    VALUES ('other', $1, $2, $3)
                    RETURNING id
                    """,
                    first or email,
                    last,
                    email,
                )
                await conn.execute(
                    """
                    INSERT INTO auth (person_id, status, app_role, last_login_at)
                    VALUES ($1, 'active', $2, NOW())
                    """,
                    person_id,
                    role,
                )
                await conn.execute(
                    """
                    INSERT INTO auth_identities (person_id, provider, provider_subject)
                    VALUES ($1, 'google', $2)
                    """,
                    person_id,
                    email,
                )
            else:
                person_id = row["id"]
                await conn.execute(
                    "SELECT set_config('app.user_id', $1, true)", str(person_id)
                )
                await conn.execute(
                    """
                    UPDATE people
                    SET first_name = $1, last_name = $2, email = $3, deleted_at = NULL
                    WHERE id = $4
                    """,
                    first or email,
                    last,
                    email,
                    person_id,
                )
                await conn.execute(
                    """
                    UPDATE auth
                    SET status = 'active', app_role = $1, last_login_at = NOW()
                    WHERE person_id = $2
                    """,
                    role,
                    person_id,
                )

            user = await conn.fetchrow(
                """
                SELECT p.id, p.email,
                       TRIM(BOTH ' ' FROM
                         COALESCE(p.first_name, '') ||
                         CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                              THEN ' ' || p.last_name ELSE '' END
                       ) AS name
                FROM people p
                WHERE p.id = $1
                """,
                person_id,
            )

    request.session["user_id"] = str(user["id"])
    request.session["user_email"] = user["email"]
    request.session["user_name"] = user["name"]


@asynccontextmanager
async def request_conn(user_id: UUID | None = None) -> AsyncIterator[asyncpg.Connection]:
    """Acquire a connection in a transaction with audit attribution set.

    Triggers in the schema read app.user_id via current_setting() to attribute
    every write to the logged-in user. Setting it transaction-locally (third arg
    true on set_config) means it doesn't leak between pool checkouts.
    """
    assert db.pool is not None, "DB pool not initialized"
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('app.user_id', $1, true)",
                str(user_id) if user_id is not None else "",
            )
            yield conn


async def get_conn(request: Request) -> AsyncIterator[asyncpg.Connection | None]:
    """Yield a per-request transaction-scoped conn, or None for unauthenticated
    requests. Routes that need a conn without a session (e.g. /auth/callback)
    must open their own via request_conn() directly.

    The session user_id is validated against the users table BEFORE setting
    app.user_id, so audit_log entries are never attributed to a forged or
    stale session value. The validated user row is cached on
    request.state.current_user so current_user() can return it without a
    second round-trip.
    """
    await _mint_e2e_session(request)

    user_id_raw = request.session.get("user_id")
    if not user_id_raw:
        request.state.current_user = None
        yield None
        return

    try:
        uid = UUID(str(user_id_raw))
    except (ValueError, TypeError):
        request.session.clear()
        request.state.current_user = None
        yield None
        return

    assert db.pool is not None, "DB pool not initialized"
    async with db.pool.acquire() as conn:
        async with conn.transaction():
            # Post-0012: validate the session via the people + auth shape.
            # Compose the legacy "name" + "is_active" fields so callers
            # of request.state.current_user (admin, audit attribution,
            # PDF rendering, etc.) keep working without changes.
            row = await conn.fetchrow(
                """
                SELECT
                  p.id, p.email,
                  TRIM(BOTH ' ' FROM
                    COALESCE(p.first_name, '') ||
                    CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                         THEN ' ' || p.last_name ELSE '' END
                  )                      AS name,
                  a.app_role             AS role,
                  (a.status = 'active')  AS is_active
                FROM people p
                JOIN auth a ON a.person_id = p.id
                WHERE p.id = $1
                  AND p.deleted_at IS NULL
                  AND a.status = 'active'
                """,
                uid,
            )
            await conn.execute(
                "SELECT set_config('app.user_id', $1, true)",
                str(row["id"]) if row else "",
            )
            request.state.current_user = row
            yield conn
