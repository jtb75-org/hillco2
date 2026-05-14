"""Catalog scoping for engagement tasks: assessment engagements only see
items tagged with the 'assessment' engagement type; full_placement
engagements see items tagged with the 'full_placement' type, which —
by seed convention — covers both assessment- and placement-scope
phases. The mapping lives in the service_item_engagement_types M2M as
of migration 0003."""
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
            student_id = await conn.fetchval(
                "INSERT INTO people (kind, first_name) VALUES ('student', 'Test Kid') RETURNING id"
            )
            await conn.execute(
                "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
                family_id, student_id,
            )
            await conn.execute(
                "INSERT INTO student_details (person_id) VALUES ($1)",
                student_id,
            )
            engagement_id = await conn.fetchval(
                """
                INSERT INTO engagements (
                  family_id, student_id, engagement_type, status, lead_consultant_id
                ) VALUES ($1, $2, $3, 'in_progress', $4)
                RETURNING id
                """,
                family_id, student_id, engagement_type, user_id,
            )
    return engagement_id


async def test_assessment_engagement_sees_assessment_items(authed_client, db_pool, test_user):
    """assessment engagements pull only items tagged with the
    `assessment` engagement type — 7 phases in the seed."""
    engagement_id = await _make_engagement_of_type(db_pool, test_user["id"], "assessment")
    r = await authed_client.get(f"/api/engagements/{engagement_id}/catalog")
    assert r.status_code == 200
    phases = r.json()
    assert len(phases) == 7, f"assessment engagement saw {len(phases)} phases"


async def test_full_placement_sees_all_phases(authed_client, db_pool, test_user):
    """full_placement engagements pull items from every phase — 11
    phases (7 assessment + 4 placement) in the seed."""
    engagement_id = await _make_engagement_of_type(db_pool, test_user["id"], "full_placement")
    r = await authed_client.get(f"/api/engagements/{engagement_id}/catalog")
    assert r.status_code == 200
    phases = r.json()
    assert len(phases) == 11, f"full_placement engagement saw {len(phases)} phases"


async def test_bulk_from_catalog_drops_non_member_items(authed_client, db_pool, test_user):
    """Pass items that aren't members of the engagement's type and the
    bulk endpoint should match 0 of them. Uses placement-only items
    (members of full_placement only, not assessment) seeded by
    seed_catalog.sql."""
    engagement_id = await _make_engagement_of_type(db_pool, test_user["id"], "assessment")
    async with db_pool.acquire() as conn:
        placement_only_ids = await conn.fetch(
            """
            SELECT si.id
            FROM service_items si
            WHERE EXISTS (
              SELECT 1 FROM service_item_engagement_types siet
              JOIN engagement_types et ON et.id = siet.engagement_type_id
              WHERE siet.service_item_id = si.id AND et.code = 'full_placement'
            )
              AND NOT EXISTS (
              SELECT 1 FROM service_item_engagement_types siet
              JOIN engagement_types et ON et.id = siet.engagement_type_id
              WHERE siet.service_item_id = si.id AND et.code = 'assessment'
            )
            LIMIT 3
            """
        )
    payload_ids = [str(r["id"]) for r in placement_only_ids]
    assert len(payload_ids) > 0, "fixture data should include placement-only items"

    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/tasks/bulk-from-catalog",
        json={"service_item_ids": payload_ids},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["requested"] == len(payload_ids)
    assert body["matched_applicable"] == 0
    assert body["created"] == 0


async def test_bulk_from_catalog_creates_tasks_for_member_items(authed_client, db_pool, test_user):
    engagement_id = await _make_engagement_of_type(db_pool, test_user["id"], "assessment")
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT si.id
            FROM service_items si
            JOIN service_item_engagement_types siet ON siet.service_item_id = si.id
            JOIN engagement_types et ON et.id = siet.engagement_type_id
            WHERE et.code = 'assessment'
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
