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
            row = await conn.fetchrow(
                "SELECT id, email, name, role, is_active FROM users WHERE id = $1 AND is_active",
                uid,
            )
            await conn.execute(
                "SELECT set_config('app.user_id', $1, true)",
                str(row["id"]) if row else "",
            )
            request.state.current_user = row
            yield conn
