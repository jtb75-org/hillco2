#!/usr/bin/env python3
"""Seed the schools table from the hillco-portal snapshot.

One-shot script. Reads `seed_schools.sql` at the repo root and applies
it against the database pointed at by DATABASE_URL. Idempotent — the
SQL file uses `ON CONFLICT (id) DO NOTHING` so re-running won't clobber
any rows the operator has edited.

Usage:

    # Against a local dev DB
    DATABASE_URL=postgresql://localhost/hillco2 python scripts/seed_schools.py

    # Against the cluster's app DB via port-forward
    kubectl port-forward -n hillco2 svc/hillco2-pg-rw 5433:5432 &
    DATABASE_URL="postgresql://$(kubectl get secret -n hillco2 hillco2-pg-app -o jsonpath='{.data.username}' | base64 -d):$(kubectl get secret -n hillco2 hillco2-pg-app -o jsonpath='{.data.password}' | base64 -d)@localhost:5433/hillco2" \\
        python scripts/seed_schools.py

The script prints a before/after row count so you can see what landed.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg


REPO_ROOT = Path(__file__).resolve().parent.parent
SEED_FILE = REPO_ROOT / "seed_schools.sql"


async def main() -> int:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("error: DATABASE_URL is required", file=sys.stderr)
        return 2
    if not SEED_FILE.exists():
        print(f"error: seed file not found at {SEED_FILE}", file=sys.stderr)
        return 2

    sql = SEED_FILE.read_text()
    print(f"applying {SEED_FILE.name} ({sql.count('INSERT INTO')} statements)…")

    conn = await asyncpg.connect(dsn)
    try:
        before = await conn.fetchval("SELECT COUNT(*) FROM schools")
        async with conn.transaction():
            await conn.execute(sql)
        after = await conn.fetchval("SELECT COUNT(*) FROM schools")
    finally:
        await conn.close()

    added = after - before
    print(f"schools: {before} → {after} (+{added} new)")
    if added == 0 and before > 0:
        print("(no new rows — every seed UUID already present)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
