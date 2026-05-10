"""Audit attribution survives a restricted search_path.

The pg_dump output we use for snapshot replay sets `search_path=''` to
keep its own SQL safe. Without the SET search_path = public, pg_catalog
declaration on `audit_trigger` and `current_app_user_id`, every INSERT
inside the dump would error mid-restore looking for an unqualified
`current_app_user_id()` function. We hit this on 2026-05-09 — this test
keeps the fix from silently regressing.
"""
from uuid import uuid4


async def test_audit_log_under_empty_search_path(db_pool, test_user):
    """Insert a school with search_path=''; verify audit_log got a row
    attributed to the test user."""
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            # Set the audit user
            await conn.execute(
                "SELECT set_config('app.user_id', $1, true)", str(test_user["id"])
            )
            # Now drop the search_path the way pg_dump does
            await conn.execute("SELECT set_config('search_path', '', false)")

            # Insert through fully-qualified name (we just nuked search_path)
            school_name = f"AuditProbe-{uuid4()}"
            await conn.execute(
                "INSERT INTO public.schools (name) VALUES ($1)", school_name
            )

            # Restore search_path so the verification queries work cleanly
            await conn.execute(
                "SELECT set_config('search_path', 'public, pg_catalog', false)"
            )
            audit_rows = await conn.fetch(
                """
                SELECT user_id, action, after_json->>'name' AS name
                FROM audit_log
                WHERE table_name = 'schools' AND after_json->>'name' = $1
                """,
                school_name,
            )

    assert len(audit_rows) == 1, "audit_log should have exactly one row for the probe insert"
    row = audit_rows[0]
    assert row["action"] == "INSERT"
    assert row["user_id"] == test_user["id"]


async def test_audit_log_user_id_is_null_without_app_setting(db_pool):
    """When app.user_id isn't set, audit_log.user_id is NULL — proves the
    nullable column does what we expect (system-driven inserts like the
    catalog seed don't fail)."""
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            # Don't set app.user_id at all
            school_name = f"NoAppUser-{uuid4()}"
            await conn.execute(
                "INSERT INTO schools (name) VALUES ($1)", school_name
            )
            user_id = await conn.fetchval(
                """
                SELECT user_id FROM audit_log
                WHERE table_name = 'schools' AND after_json->>'name' = $1
                """,
                school_name,
            )
    assert user_id is None
