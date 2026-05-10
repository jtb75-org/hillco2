"""Catalog scoping for engagement tasks: assessment engagements only see
phases tagged 'assessment'; full_placement engagements see both scopes.
The mapping is in app code (ENGAGEMENT_TYPE_SCOPES), not the DB, so a
regression there silently shows the wrong tasks in the SPA's seed-plan
picker."""
from uuid import uuid4


async def _make_engagement_of_type(db_pool, user_id, engagement_type: str):
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('app.user_id', $1, true)", str(user_id)
            )
            family_id = await conn.fetchval(
                "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
                f"Family-{uuid4()}",
            )
            engagement_id = await conn.fetchval(
                """
                INSERT INTO engagements (
                  family_id, engagement_type, status, lead_consultant_id
                ) VALUES ($1, $2::engagement_type, 'in_progress', $3)
                RETURNING id
                """,
                family_id, engagement_type, user_id,
            )
    return engagement_id


async def test_assessment_engagement_sees_assessment_scope_only(authed_client, db_pool, test_user):
    engagement_id = await _make_engagement_of_type(db_pool, test_user["id"], "assessment")
    r = await authed_client.get(f"/api/engagements/{engagement_id}/catalog")
    assert r.status_code == 200
    phases = r.json()
    scopes = {p["scope"] for p in phases}
    assert scopes == {"assessment"}, f"assessment engagement saw scopes {scopes}"


async def test_full_placement_sees_both_scopes(authed_client, db_pool, test_user):
    engagement_id = await _make_engagement_of_type(db_pool, test_user["id"], "full_placement")
    r = await authed_client.get(f"/api/engagements/{engagement_id}/catalog")
    assert r.status_code == 200
    phases = r.json()
    scopes = {p["scope"] for p in phases}
    assert scopes == {"assessment", "placement"}, (
        f"full_placement engagement saw scopes {scopes}"
    )


async def test_bulk_from_catalog_drops_out_of_scope_items(authed_client, db_pool, test_user):
    """Pass placement-scoped service_item_ids to an assessment engagement;
    matched_applicable should be 0, no tasks created. Defends against a
    SPA bug where the user picks placement items for an assessment engagement."""
    engagement_id = await _make_engagement_of_type(db_pool, test_user["id"], "assessment")
    async with db_pool.acquire() as conn:
        placement_ids = await conn.fetch(
            """
            SELECT si.id
            FROM service_items si
            JOIN catalog_phases cp ON cp.id = si.phase_id
            WHERE cp.scope = 'placement'
            LIMIT 3
            """
        )
    payload_ids = [str(r["id"]) for r in placement_ids]
    assert len(payload_ids) > 0, "fixture data should include placement items from seed"

    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/tasks/bulk-from-catalog",
        json={"service_item_ids": payload_ids},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["requested"] == len(payload_ids)
    assert body["matched_applicable"] == 0
    assert body["created"] == 0


async def test_bulk_from_catalog_creates_tasks_for_in_scope_items(authed_client, db_pool, test_user):
    engagement_id = await _make_engagement_of_type(db_pool, test_user["id"], "assessment")
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT si.id
            FROM service_items si
            JOIN catalog_phases cp ON cp.id = si.phase_id
            WHERE cp.scope = 'assessment'
            LIMIT 3
            """
        )
    payload_ids = [str(r["id"]) for r in rows]

    # First call creates them
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/tasks/bulk-from-catalog",
        json={"service_item_ids": payload_ids},
    )
    assert r.status_code == 201
    assert r.json()["created"] == len(payload_ids)

    # Idempotency: second call with the same ids creates 0
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/tasks/bulk-from-catalog",
        json={"service_item_ids": payload_ids},
    )
    assert r.json()["created"] == 0, "bulk-from-catalog should be idempotent per service_item_id"
