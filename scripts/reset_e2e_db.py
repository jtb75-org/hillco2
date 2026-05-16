"""Reset the browser E2E database and seed catalog data.

This intentionally mirrors the pytest integration fixture: drop the public
schema, run Alembic to head, then apply seed_catalog.sql.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
from urllib.parse import urlparse

import asyncpg
from alembic.config import Config

from alembic import command

REPO_ROOT = Path(__file__).resolve().parent.parent


def _database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("TEST_DATABASE_URL or DATABASE_URL is required")

    parsed = urlparse(url)
    db_name = parsed.path.rsplit("/", 1)[-1]
    if parsed.hostname not in {"localhost", "127.0.0.1", "postgres"}:
        raise SystemExit(f"Refusing to reset non-local E2E database: {parsed.hostname}")
    if not db_name.endswith("_test"):
        raise SystemExit(f"Refusing to reset non-test database: {db_name}")
    return url


def _alembic_config() -> Config:
    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "alembic"))
    return cfg


async def main() -> None:
    url = _database_url()
    os.environ["DATABASE_URL"] = url

    conn = await asyncpg.connect(url)
    try:
        await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    finally:
        await conn.close()

    await asyncio.to_thread(command.upgrade, _alembic_config(), "head")

    conn = await asyncpg.connect(url)
    try:
        await conn.execute((REPO_ROOT / "seed_catalog.sql").read_text())
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
