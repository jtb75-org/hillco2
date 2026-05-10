"""Schema sanity: catalog seed counts + the search_path hardening on the
audit functions. If anyone removes the `SET search_path` on the audit
functions, every restore-from-pg_dump (which sets search_path='') breaks
silently — this test catches it."""


async def test_catalog_seed_counts(db_pool):
    """11 phases / 28 items per the redesign doc. If this drifts, the SPA's
    catalog UX assumptions need to drift with it."""
    async with db_pool.acquire() as conn:
        phase_count = await conn.fetchval("SELECT COUNT(*) FROM catalog_phases")
        item_count = await conn.fetchval("SELECT COUNT(*) FROM service_items")
    assert phase_count == 11, f"expected 11 phases from seed_catalog.sql, got {phase_count}"
    assert item_count == 28, f"expected 28 service_items from seed_catalog.sql, got {item_count}"


async def test_phase_scopes(db_pool):
    """7 assessment phases + 4 placement phases."""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT scope, COUNT(*) AS n FROM catalog_phases GROUP BY scope"
        )
    counts = {r["scope"]: r["n"] for r in rows}
    assert counts == {"assessment": 7, "placement": 4}


async def test_audit_functions_pin_search_path(db_pool):
    """audit_trigger + current_app_user_id must have proconfig containing
    'search_path=public, pg_catalog'. Removing it lets pg_dump output (which
    sets search_path='') break every INSERT that fires the trigger."""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT proname, array_to_string(proconfig, ',') AS proconfig
            FROM pg_proc
            WHERE pronamespace = 'public'::regnamespace
              AND proname IN ('audit_trigger', 'current_app_user_id')
            """
        )
    by_name = {r["proname"]: r["proconfig"] or "" for r in rows}
    assert "search_path=public, pg_catalog" in by_name.get("audit_trigger", "")
    assert "search_path=public, pg_catalog" in by_name.get("current_app_user_id", "")


async def test_engagement_financial_summary_view_exists(db_pool):
    """The view is referenced by /api/dashboard and /api/invoices listing.
    Schema port that drops it would silently break those endpoints at
    runtime, not load time."""
    async with db_pool.acquire() as conn:
        exists = await conn.fetchval(
            """
            SELECT EXISTS(
              SELECT 1 FROM information_schema.views
              WHERE table_schema = 'public' AND table_name = 'engagement_financial_summary'
            )
            """
        )
    assert exists


async def test_unique_engagement_student_learning_profile(db_pool):
    """One profile per (engagement, student). Loosening this would let two
    profiles for the same student in the same engagement co-exist, and the
    SPA's lookup logic wouldn't know which to show."""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT array_agg(a.attname ORDER BY a.attname) AS cols
            FROM pg_index i
            JOIN pg_class c ON c.oid = i.indrelid
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
            WHERE c.relname = 'learning_profiles' AND i.indisunique AND NOT i.indisprimary
            GROUP BY i.indexrelid
            """
        )
    cols_sets = [tuple(r["cols"]) for r in rows]
    assert ("engagement_id", "student_id") in cols_sets
