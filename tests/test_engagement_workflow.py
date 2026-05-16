"""New engagement workflow integration scaffold."""

from uuid import uuid4

import asyncpg
import pytest

pending_backend = pytest.mark.skip(
    reason="Engagement workflow backend slice has not landed yet."
)


# ---- Helpers -------------------------------------------------------------


async def _make_engagement(db_pool, user_id, engagement_type="assessment"):
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT set_config('app.user_id', $1, true)", str(user_id)
            )
            family_id = await conn.fetchval(
                "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
                f"Workflow-{uuid4()}",
            )
            student_id = await conn.fetchval(
                """
                INSERT INTO people (kind, first_name, last_name)
                VALUES ('student', 'Workflow', 'Student')
                RETURNING id
                """
            )
            await conn.execute(
                "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
                family_id,
                student_id,
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
                family_id,
                student_id,
                engagement_type,
                user_id,
            )
    return {
        "id": engagement_id,
        "family_id": family_id,
        "student_id": student_id,
    }


async def _make_family_with_two_students(db_pool):
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"Workflow family {uuid4()}",
        )
        s_a = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, last_name)
            VALUES ('student', 'Workflow', 'A')
            RETURNING id
            """
        )
        s_b = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, last_name)
            VALUES ('student', 'Workflow', 'B')
            RETURNING id
            """
        )
        await conn.execute(
            """
            INSERT INTO family_students (family_id, person_id)
            VALUES ($1, $2), ($1, $3)
            """,
            family_id,
            s_a,
            s_b,
        )
        await conn.execute(
            "INSERT INTO student_details (person_id) VALUES ($1), ($2)",
            s_a,
            s_b,
        )
    return {"family_id": family_id, "students": [s_a, s_b]}


async def _create_task(authed_client, engagement_id, **overrides):
    payload = {
        "title": f"Workflow task {uuid4()}",
        "description": "Test task",
        "activity_kind": "task",
    }
    payload.update(overrides)
    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/tasks",
        json=payload,
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _insert_document(db_pool, *, owner_type, owner_id, kind="other"):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            """
            INSERT INTO documents (
              owner_type, owner_id, kind, filename, content_type, byte_size, s3_key
            ) VALUES ($1::document_owner_type, $2, $3::document_kind,
                      $4, 'application/pdf', 1, $5)
            RETURNING id
            """,
            owner_type,
            owner_id,
            kind,
            f"{kind}-{uuid4()}.pdf",
            f"s3-{uuid4()}",
        )


async def _insert_school(db_pool, *, name=None):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            "INSERT INTO schools (name) VALUES ($1) RETURNING id",
            name or f"Workflow school {uuid4()}",
        )


async def _create_intake(authed_client, family_id, students=()):
    r = await authed_client.post("/api/intakes", json={"family_id": str(family_id)})
    assert r.status_code == 201, r.text
    intake = r.json()
    for student_id in students:
        link = await authed_client.post(
            f"/api/intakes/{intake['id']}/students",
            json={"person_id": str(student_id)},
        )
        assert link.status_code == 201, link.text
    return intake


async def _prepare_converting_intake(
    authed_client,
    family,
    *,
    candidates=1,
    engagement_type="assessment",
):
    intake = await _create_intake(
        authed_client,
        family["family_id"],
        family["students"],
    )
    outcome = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": "converting"},
    )
    assert outcome.status_code == 200, outcome.text
    for student_id in family["students"][:candidates]:
        patch = await authed_client.patch(
            f"/api/intakes/{intake['id']}/students/{student_id}",
            json={
                "candidate": True,
                "recommended_engagement_type": engagement_type,
            },
        )
        assert patch.status_code == 200, patch.text
    return intake


async def _insert_catalog_item(
    db_pool,
    *,
    engagement_type="assessment",
    activity_kind="task",
    title=None,
):
    async with db_pool.acquire() as conn:
        phase_id = await conn.fetchval(
            """
            SELECT id
            FROM catalog_phases
            WHERE deleted_at IS NULL
            ORDER BY sort_order
            LIMIT 1
            """
        )
        item_id = await conn.fetchval(
            """
            INSERT INTO service_items (
              phase_id, title, sort_order, default_activity_kind
            ) VALUES ($1, $2, 9999, $3::activity_kind)
            RETURNING id
            """,
            phase_id,
            title or f"Workflow catalog item {uuid4()}",
            activity_kind,
        )
        engagement_type_id = await conn.fetchval(
            "SELECT id FROM engagement_types WHERE code = $1",
            engagement_type,
        )
        await conn.execute(
            """
            INSERT INTO service_item_engagement_types (
              service_item_id, engagement_type_id
            ) VALUES ($1, $2)
            """,
            item_id,
            engagement_type_id,
        )
    return item_id


async def _delete_catalog_item(db_pool, item_id):
    async with db_pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM engagement_tasks WHERE service_item_id = $1",
            item_id,
        )
        await conn.execute(
            """
            DELETE FROM service_item_engagement_types
            WHERE service_item_id = $1
            """,
            item_id,
        )
        await conn.execute("DELETE FROM service_items WHERE id = $1", item_id)


# ---- Activity kind + structured content ---------------------------------


async def test_task_patch_round_trips_activity_kind(
    authed_client, db_pool, test_user
):
    """PATCH /api/tasks/{task_id} persists activity_kind."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    task = await _create_task(authed_client, engagement["id"])

    r = await authed_client.patch(
        f"/api/tasks/{task['id']}",
        json={"activity_kind": "feedback_meeting"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["activity_kind"] == "feedback_meeting"

    listed = await authed_client.get(f"/api/engagements/{engagement['id']}/tasks")
    assert listed.status_code == 200, listed.text
    assert listed.json()[0]["activity_kind"] == "feedback_meeting"


async def test_task_patch_round_trips_structured_content_per_kind(
    authed_client, db_pool, test_user
):
    """PATCH /api/tasks/{task_id} persists structured_content for rich kinds."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    family_doc = await _insert_document(
        db_pool,
        owner_type="family",
        owner_id=engagement["family_id"],
        kind="iep",
    )
    student_doc = await _insert_document(
        db_pool,
        owner_type="student",
        owner_id=engagement["student_id"],
        kind="medical",
    )
    cases = [
        (
            "best_environment",
            {
                "curriculum": "<p>Project-based</p>",
                "placement_size": "<p>Small classes</p>",
                "social_emotional": "<p>Structured support</p>",
                "extras": "<p>Clubs</p>",
            },
        ),
        (
            "document_review",
            {
                "educational_doc_ids": [str(family_doc)],
                "medical_doc_ids": [str(student_doc)],
            },
        ),
        (
            "feedback_meeting",
            {
                "recommendations": "<p>School A</p>",
                "admissions": "<p>Apply by Jan 15</p>",
                "follow_on": "<p>Schedule visit</p>",
            },
        ),
    ]

    for kind, content in cases:
        task = await _create_task(authed_client, engagement["id"])
        r = await authed_client.patch(
            f"/api/tasks/{task['id']}",
            json={"activity_kind": kind, "structured_content": content},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["activity_kind"] == kind
        assert body["structured_content"] == content


async def test_task_patch_rejects_wrong_keys_for_kind(
    authed_client, db_pool, test_user
):
    """PATCH rejects structured_content keys that do not belong to activity_kind."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    task = await _create_task(authed_client, engagement["id"])

    r = await authed_client.patch(
        f"/api/tasks/{task['id']}",
        json={
            "activity_kind": "best_environment",
            "structured_content": {"visit_date": "2026-05-20"},
        },
    )
    assert r.status_code == 400
    assert "invalid structured_content" in r.json()["detail"].lower()


async def test_task_patch_kind_change_resets_structured_content(
    authed_client, db_pool, test_user
):
    """Changing activity_kind without fresh content resets structured_content."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    task = await _create_task(
        authed_client,
        engagement["id"],
        activity_kind="feedback_meeting",
        structured_content={
            "recommendations": "<p>School A</p>",
            "admissions": "<p>Apply</p>",
            "follow_on": "<p>Visit</p>",
        },
    )

    r = await authed_client.patch(
        f"/api/tasks/{task['id']}",
        json={"activity_kind": "best_environment"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["activity_kind"] == "best_environment"
    assert set(body["structured_content"]) == {
        "curriculum",
        "placement_size",
        "social_emotional",
        "extras",
    }
    assert "recommendations" not in body["structured_content"]


async def test_document_review_validates_doc_ids_belong_to_family(
    authed_client, db_pool, test_user
):
    """Document-review content rejects foreign document ids with 400."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    other_engagement = await _make_engagement(db_pool, test_user["id"])
    task = await _create_task(authed_client, engagement["id"])
    in_scope_doc = await _insert_document(
        db_pool,
        owner_type="engagement",
        owner_id=engagement["id"],
    )
    foreign_doc = await _insert_document(
        db_pool,
        owner_type="family",
        owner_id=other_engagement["family_id"],
    )

    ok = await authed_client.patch(
        f"/api/tasks/{task['id']}",
        json={
            "activity_kind": "document_review",
            "structured_content": {
                "educational_doc_ids": [str(in_scope_doc)],
                "medical_doc_ids": [],
            },
        },
    )
    assert ok.status_code == 200, ok.text

    bad = await authed_client.patch(
        f"/api/tasks/{task['id']}",
        json={
            "structured_content": {
                "educational_doc_ids": [str(foreign_doc)],
                "medical_doc_ids": [],
            },
        },
    )
    assert bad.status_code == 400
    assert "not in this engagement" in bad.json()["detail"].lower()


async def test_skip_endpoint_sets_not_applicable_idempotent(
    authed_client, db_pool, test_user
):
    """POST /api/tasks/{task_id}/status sets not_applicable idempotently."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    task = await _create_task(authed_client, engagement["id"])

    for _ in range(2):
        r = await authed_client.post(
            f"/api/tasks/{task['id']}/status",
            json={"status": "not_applicable"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "not_applicable"


async def test_task_delete_hard_deletes_bespoke(authed_client, db_pool, test_user):
    """DELETE /api/tasks/{task_id} hard-deletes a bespoke task."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    task = await _create_task(authed_client, engagement["id"])

    r = await authed_client.delete(f"/api/tasks/{task['id']}")
    assert r.status_code == 204, r.text

    async with db_pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM engagement_tasks WHERE id = $1",
            task["id"],
        )
    assert exists is None


async def test_task_delete_sets_linked_visit_rec_engagement_task_id_null(
    authed_client, db_pool, test_user
):
    """Deleting a linked task nulls visit/recommendation engagement_task_id."""
    visit_engagement = await _make_engagement(db_pool, test_user["id"])
    visit_school_id = await _insert_school(db_pool)
    visit = (
        await authed_client.post(
            f"/api/engagements/{visit_engagement['id']}/visits",
            json={"school_id": str(visit_school_id)},
        )
    ).json()

    rec_engagement = await _make_engagement(db_pool, test_user["id"])
    rec_school_id = await _insert_school(db_pool)
    rec = (
        await authed_client.post(
            f"/api/engagements/{rec_engagement['id']}/recommendations",
            json={"school_id": str(rec_school_id)},
        )
    ).json()

    delete_visit_task = await authed_client.delete(
        f"/api/tasks/{visit['engagement_task_id']}"
    )
    assert delete_visit_task.status_code == 204, delete_visit_task.text
    delete_rec_task = await authed_client.delete(f"/api/tasks/{rec['engagement_task_id']}")
    assert delete_rec_task.status_code == 204, delete_rec_task.text

    async with db_pool.acquire() as conn:
        visit_task_id = await conn.fetchval(
            "SELECT engagement_task_id FROM school_visits WHERE id = $1",
            visit["id"],
        )
        rec_task_id = await conn.fetchval(
            "SELECT engagement_task_id FROM school_recommendations WHERE id = $1",
            rec["id"],
        )
    assert visit_task_id is None
    assert rec_task_id is None


async def test_get_engagement_tasks_default_excludes_not_applicable(
    authed_client, db_pool, test_user
):
    """GET /api/engagements/{id}/tasks hides skipped tasks by default."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    visible = await _create_task(authed_client, engagement["id"], title="Visible task")
    skipped = await _create_task(authed_client, engagement["id"], title="Skipped task")
    r = await authed_client.post(
        f"/api/tasks/{skipped['id']}/status",
        json={"status": "not_applicable"},
    )
    assert r.status_code == 200, r.text

    listed = await authed_client.get(f"/api/engagements/{engagement['id']}/tasks")
    assert listed.status_code == 200, listed.text
    ids = {row["id"] for row in listed.json()}
    assert visible["id"] in ids
    assert skipped["id"] not in ids


async def test_get_engagement_tasks_include_skipped_returns_all(
    authed_client, db_pool, test_user
):
    """GET /api/engagements/{id}/tasks?include_skipped=true returns skipped tasks."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    visible = await _create_task(authed_client, engagement["id"], title="Visible task")
    skipped = await _create_task(authed_client, engagement["id"], title="Skipped task")
    r = await authed_client.post(
        f"/api/tasks/{skipped['id']}/status",
        json={"status": "not_applicable"},
    )
    assert r.status_code == 200, r.text

    listed = await authed_client.get(
        f"/api/engagements/{engagement['id']}/tasks",
        params={"include_skipped": "true"},
    )
    assert listed.status_code == 200, listed.text
    ids = {row["id"] for row in listed.json()}
    assert {visible["id"], skipped["id"]}.issubset(ids)


async def test_catalog_default_activity_kind_inherited_on_seed(
    authed_client, db_pool, test_user
):
    """Catalog seeding copies service_items.default_activity_kind to tasks."""
    engagement = await _make_engagement(db_pool, test_user["id"], "full_placement")
    item_id = await _insert_catalog_item(
        db_pool,
        engagement_type="full_placement",
        activity_kind="feedback_meeting",
        title=f"Workflow feedback meeting {uuid4()}",
    )

    try:
        r = await authed_client.post(
            f"/api/engagements/{engagement['id']}/tasks/bulk-from-catalog",
            json={"service_item_ids": [str(item_id)]},
        )
        assert r.status_code == 201, r.text
        task_id = r.json()["task_ids"][0]

        listed = await authed_client.get(f"/api/engagements/{engagement['id']}/tasks")
        assert listed.status_code == 200, listed.text
        task = next(row for row in listed.json() if row["id"] == task_id)
        assert task["activity_kind"] == "feedback_meeting"
    finally:
        await _delete_catalog_item(db_pool, item_id)


# ---- Visit/recommendation links -----------------------------------------


async def test_atomic_create_school_visit_creates_task_and_visit(
    authed_client, db_pool, test_user
):
    """Atomic school-visit create returns both task and visit records."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    school_id = await _insert_school(db_pool, name="Workflow Visit School")

    r = await authed_client.post(
        f"/api/engagements/{engagement['id']}/visits",
        json={
            "school_id": str(school_id),
            "visit_date": "2026-05-20",
            "facts_notes": "Observed classes.",
            "task_title": "Tour Workflow Visit School",
        },
    )
    assert r.status_code == 201, r.text
    visit = r.json()
    assert visit["engagement_task_id"]
    assert visit["school_id"] == str(school_id)

    task = await authed_client.get(f"/api/engagements/{engagement['id']}/tasks")
    assert task.status_code == 200, task.text
    linked_task = next(
        row for row in task.json() if row["id"] == visit["engagement_task_id"]
    )
    assert linked_task["activity_kind"] == "school_visit"
    assert linked_task["title"] == "Tour Workflow Visit School"


async def test_atomic_create_school_visit_rolls_back_on_visit_failure(
    authed_client, db_pool, test_user
):
    """Failed school-visit insert rolls back its companion task."""
    engagement = await _make_engagement(db_pool, test_user["id"])

    r = await authed_client.post(
        f"/api/engagements/{engagement['id']}/visits",
        json={"school_id": str(uuid4()), "task_title": "Should not persist"},
    )
    assert r.status_code == 400
    async with db_pool.acquire() as conn:
        task_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM engagement_tasks
            WHERE engagement_id = $1 AND title = 'Should not persist'
            """,
            engagement["id"],
        )
    assert task_count == 0


async def test_school_visits_engagement_task_id_partial_unique_enforced(
    authed_client, db_pool, test_user
):
    """school_visits allows only one non-null row per engagement_task_id."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    school_a = await _insert_school(db_pool)
    school_b = await _insert_school(db_pool)
    task = await _create_task(
        authed_client,
        engagement["id"],
        activity_kind="school_visit",
    )

    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO school_visits (
              engagement_id, school_id, visit_date, engagement_task_id
            ) VALUES ($1, $2, CURRENT_DATE, $3)
            """,
            engagement["id"],
            school_a,
            task["id"],
        )
        with pytest.raises(asyncpg.UniqueViolationError):
            await conn.execute(
                """
                INSERT INTO school_visits (
                  engagement_id, school_id, visit_date, engagement_task_id
                ) VALUES ($1, $2, CURRENT_DATE, $3)
                """,
                engagement["id"],
                school_b,
                task["id"],
            )


async def test_school_recommendations_engagement_task_id_partial_unique_enforced(
    authed_client, db_pool, test_user
):
    """school_recommendations allows only one non-null row per engagement_task_id."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    school_a = await _insert_school(db_pool)
    school_b = await _insert_school(db_pool)
    task = await _create_task(
        authed_client,
        engagement["id"],
        activity_kind="school_recommendation",
    )

    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO school_recommendations (
              engagement_id, school_id, engagement_task_id
            ) VALUES ($1, $2, $3)
            """,
            engagement["id"],
            school_a,
            task["id"],
        )
        with pytest.raises(asyncpg.UniqueViolationError):
            await conn.execute(
                """
                INSERT INTO school_recommendations (
                  engagement_id, school_id, engagement_task_id
                ) VALUES ($1, $2, $3)
                """,
                engagement["id"],
                school_b,
                task["id"],
            )


async def test_atomic_create_school_recommendation_409_on_engagement_school_collision(
    authed_client, db_pool, test_user
):
    """Atomic recommendation create returns 409 for duplicate engagement/school."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    school_id = await _insert_school(db_pool)

    first = await authed_client.post(
        f"/api/engagements/{engagement['id']}/recommendations",
        json={"school_id": str(school_id), "rank": 1},
    )
    assert first.status_code == 201, first.text
    duplicate = await authed_client.post(
        f"/api/engagements/{engagement['id']}/recommendations",
        json={"school_id": str(school_id), "rank": 2},
    )
    assert duplicate.status_code == 409
    assert "already exists" in duplicate.json()["detail"].lower()


async def test_atomic_create_school_recommendation_does_not_orphan_task_on_collision(
    authed_client, db_pool, test_user
):
    """Recommendation collision validation happens before task insert."""
    engagement = await _make_engagement(db_pool, test_user["id"])
    school_id = await _insert_school(db_pool)

    first = await authed_client.post(
        f"/api/engagements/{engagement['id']}/recommendations",
        json={"school_id": str(school_id)},
    )
    assert first.status_code == 201, first.text
    async with db_pool.acquire() as conn:
        before = await conn.fetchval(
            """
            SELECT COUNT(*) FROM engagement_tasks
            WHERE engagement_id = $1
              AND activity_kind = 'school_recommendation'::activity_kind
            """,
            engagement["id"],
        )
    duplicate = await authed_client.post(
        f"/api/engagements/{engagement['id']}/recommendations",
        json={"school_id": str(school_id)},
    )
    assert duplicate.status_code == 409
    async with db_pool.acquire() as conn:
        after = await conn.fetchval(
            """
            SELECT COUNT(*) FROM engagement_tasks
            WHERE engagement_id = $1
              AND activity_kind = 'school_recommendation'::activity_kind
            """,
            engagement["id"],
        )
    assert after == before


async def test_cross_engagement_task_link_rejected_by_api(
    authed_client, db_pool, test_user
):
    """PATCH rejects linking a visit/recommendation to another engagement's task."""
    engagement_a = await _make_engagement(db_pool, test_user["id"])
    engagement_b = await _make_engagement(db_pool, test_user["id"])
    school_a = await _insert_school(db_pool)
    school_b = await _insert_school(db_pool)
    foreign_task = await _create_task(authed_client, engagement_b["id"])

    visit = await authed_client.post(
        f"/api/engagements/{engagement_a['id']}/visits",
        json={"school_id": str(school_a)},
    )
    assert visit.status_code == 201, visit.text
    visit_patch = await authed_client.patch(
        f"/api/visits/{visit.json()['id']}",
        json={"engagement_task_id": foreign_task["id"]},
    )
    assert visit_patch.status_code == 400

    rec = await authed_client.post(
        f"/api/engagements/{engagement_a['id']}/recommendations",
        json={"school_id": str(school_b)},
    )
    assert rec.status_code == 201, rec.text
    rec_patch = await authed_client.patch(
        f"/api/recommendations/{rec.json()['id']}",
        json={"engagement_task_id": foreign_task["id"]},
    )
    assert rec_patch.status_code == 400


# ---- Convert auto-seed ---------------------------------------------------


async def test_convert_seeds_engagement_tasks_for_applicable_catalog_items(
    authed_client, db_pool
):
    """Intake conversion seeds tasks for matching service catalog items."""
    family = await _make_family_with_two_students(db_pool)
    intake = await _prepare_converting_intake(authed_client, family)

    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 200, r.text
    engagement_id = r.json()["engagement_ids"][0]

    async with db_pool.acquire() as conn:
        expected = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM service_items si
            JOIN service_item_engagement_types siet ON siet.service_item_id = si.id
            JOIN engagement_types et ON et.id = siet.engagement_type_id
            JOIN catalog_phases cp ON cp.id = si.phase_id
            WHERE si.deleted_at IS NULL
              AND cp.deleted_at IS NULL
              AND et.deleted_at IS NULL
              AND et.code = 'assessment'
            """
        )
        tasks = await conn.fetch(
            """
            SELECT service_item_id, title
            FROM engagement_tasks
            WHERE engagement_id = $1 AND service_item_id IS NOT NULL
            ORDER BY sort_order, title
            """,
            engagement_id,
        )
    assert len(tasks) == expected
    assert all(row["service_item_id"] for row in tasks)


async def test_convert_seeded_tasks_inherit_default_activity_kind(
    authed_client, db_pool
):
    """Tasks seeded during conversion inherit default_activity_kind."""
    item_id = await _insert_catalog_item(
        db_pool,
        engagement_type="assessment",
        activity_kind="feedback_meeting",
        title=f"Workflow convert feedback {uuid4()}",
    )
    try:
        intake = await _prepare_converting_intake(
            authed_client,
            await _make_family_with_two_students(db_pool),
        )
        r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
        assert r.status_code == 200, r.text
        engagement_id = r.json()["engagement_ids"][0]

        async with db_pool.acquire() as conn:
            kind = await conn.fetchval(
                """
                SELECT activity_kind::text
                FROM engagement_tasks
                WHERE engagement_id = $1 AND service_item_id = $2
                """,
                engagement_id,
                item_id,
            )
        assert kind == "feedback_meeting"
    finally:
        await _delete_catalog_item(db_pool, item_id)


async def test_convert_idempotent_via_converted_at(
    authed_client, db_pool
):
    """Repeated intake conversion is guarded by converted_at."""
    family = await _make_family_with_two_students(db_pool)
    intake = await _prepare_converting_intake(authed_client, family)
    first = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    second = await authed_client.post(f"/api/intakes/{intake['id']}/convert")

    assert first.status_code == 200, first.text
    assert second.status_code == 409
    engagement_id = first.json()["engagement_ids"][0]
    async with db_pool.acquire() as conn:
        engagement_count = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM engagements
            WHERE intake_id = $1 AND deleted_at IS NULL
            """,
            intake["id"],
        )
        task_pairs = await conn.fetchval(
            """
            SELECT COUNT(DISTINCT service_item_id)
            FROM engagement_tasks
            WHERE engagement_id = $1 AND service_item_id IS NOT NULL
            """,
            engagement_id,
        )
        task_count = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM engagement_tasks
            WHERE engagement_id = $1 AND service_item_id IS NOT NULL
            """,
            engagement_id,
        )
    assert engagement_count == 1
    assert task_count == task_pairs


async def test_manual_bulk_from_catalog_still_works_after_convert(
    authed_client, db_pool
):
    """Manual bulk-from-catalog remains usable after convert auto-seeding."""
    family = await _make_family_with_two_students(db_pool)
    intake = await _prepare_converting_intake(authed_client, family)
    converted = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert converted.status_code == 200, converted.text
    engagement_id = converted.json()["engagement_ids"][0]

    item_id = await _insert_catalog_item(
        db_pool,
        engagement_type="assessment",
        title=f"Workflow post-convert catalog {uuid4()}",
    )
    try:
        r = await authed_client.post(
            f"/api/engagements/{engagement_id}/tasks/bulk-from-catalog",
            json={"service_item_ids": [str(item_id)]},
        )
        assert r.status_code == 201, r.text
        assert r.json()["created"] == 1
        assert r.json()["task_ids"]
    finally:
        await _delete_catalog_item(db_pool, item_id)


async def test_bulk_from_catalog_idempotent_on_engagement_id_service_item_id(
    authed_client, db_pool, test_user
):
    """Bulk catalog seeding is idempotent on engagement_id plus service_item_id."""
    engagement = await _make_engagement(db_pool, test_user["id"], "assessment")
    item_id = await _insert_catalog_item(
        db_pool,
        engagement_type="assessment",
        title=f"Workflow idempotent catalog {uuid4()}",
    )
    try:
        first = await authed_client.post(
            f"/api/engagements/{engagement['id']}/tasks/bulk-from-catalog",
            json={"service_item_ids": [str(item_id)]},
        )
        second = await authed_client.post(
            f"/api/engagements/{engagement['id']}/tasks/bulk-from-catalog",
            json={"service_item_ids": [str(item_id)]},
        )
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
        assert first.json()["created"] == 1
        assert second.json()["created"] == 0

        async with db_pool.acquire() as conn:
            count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM engagement_tasks
                WHERE engagement_id = $1 AND service_item_id = $2
                """,
                engagement["id"],
                item_id,
            )
        assert count == 1
    finally:
        await _delete_catalog_item(db_pool, item_id)


# ---- Agreements + requirements ------------------------------------------


@pending_backend
async def test_agreement_create_starts_in_draft_no_sent_at():
    """Agreement creation starts draft with sent_at unset."""
    pytest.skip("TODO: POST agreement and assert draft/null sent_at.")


@pending_backend
async def test_agreement_mark_sent_stamps_sent_at_status_stays_draft():
    """Mark-sent stamps sent_at without leaving draft status."""
    pytest.skip("TODO: call mark-sent and assert sent_at plus draft status.")


@pending_backend
async def test_agreement_upload_signed_attaches_document_flips_to_active():
    """Upload-signed creates document link and activates the agreement."""
    pytest.skip("TODO: multipart upload and assert document_id/signed_at/status.")


@pending_backend
async def test_agreement_supersede_flips_to_superseded():
    """Superseding an agreement flips status to superseded."""
    pytest.skip("TODO: exercise supersede path once route lands.")


@pending_backend
async def test_requirement_patch_status_and_notes_round_trip():
    """Requirement PATCH persists status and notes."""
    pytest.skip("TODO: patch requirement status/notes and refetch.")


@pending_backend
async def test_requirement_status_check_constraint():
    """Invalid requirement status is rejected by the DB/API enum guard."""
    pytest.skip("TODO: assert invalid status fails.")


@pending_backend
async def test_requirements_backfill_value_present_sets_received():
    """Migration 0013 backfills value-bearing requirements as received."""
    pytest.skip("TODO: assert migrated rows with value get status received.")


@pending_backend
async def test_agreements_sent_at_column_exists_and_nullable():
    """Migration 0012 adds nullable agreements.sent_at."""
    pytest.skip("TODO: introspect column or insert agreement without sent_at.")


# ---- Existing-behavior guards -------------------------------------------


@pending_backend
async def test_time_entry_locked_when_invoice_id_set_400_on_edit():
    """Time entries linked to an invoice still reject edits with 400."""
    pytest.skip("TODO: create invoiced time entry and assert edit blocked.")


@pending_backend
async def test_expense_locked_when_invoice_id_set_400_on_edit():
    """Expenses linked to an invoice still reject edits with 400."""
    pytest.skip("TODO: create invoiced expense and assert edit blocked.")


@pending_backend
async def test_school_visits_hours_independent_from_time_entries():
    """School-visit hours remain independent from billable time entries."""
    pytest.skip("TODO: create both records and assert no implicit time linkage.")
