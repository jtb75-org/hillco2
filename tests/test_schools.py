"""Schools API coverage."""

from uuid import uuid4


async def _insert_school(db_pool, *, name=None, location=None, deleted=False):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            """
            INSERT INTO schools (name, location, deleted_at)
            VALUES ($1, $2, CASE WHEN $3 THEN NOW() ELSE NULL END)
            RETURNING id
            """,
            name or f"School-{uuid4()}",
            location,
            deleted,
        )


async def _insert_engagement_for_school_artifacts(db_pool, test_user):
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"School family {uuid4()}",
        )
        student_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name)
            VALUES ('student', 'School Student')
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
            )
            VALUES ($1, $2, 'assessment', 'in_progress', $3)
            RETURNING id
            """,
            family_id,
            student_id,
            test_user["id"],
        )
    return {"family_id": family_id, "engagement_id": engagement_id}


async def test_list_schools_returns_active_rows_and_excludes_deleted(
    authed_client, db_pool
):
    """GET /api/schools lists active schools and excludes soft-deleted schools."""
    active_id = await _insert_school(db_pool, name=f"Active {uuid4()}")
    deleted_id = await _insert_school(db_pool, name=f"Deleted {uuid4()}", deleted=True)

    r = await authed_client.get("/api/schools")

    assert r.status_code == 200, r.text
    ids = {row["id"] for row in r.json()}
    assert str(active_id) in ids
    assert str(deleted_id) not in ids


async def test_list_schools_q_filters_name_and_location(authed_client, db_pool):
    """GET /api/schools?q= filters over school name and location."""
    name_id = await _insert_school(db_pool, name="Pine Searchable Academy")
    location_id = await _insert_school(db_pool, name="Other Academy", location="Pine Town")
    miss_id = await _insert_school(db_pool, name="Cedar Academy", location="Oak Town")

    r = await authed_client.get("/api/schools", params={"q": "pine"})

    assert r.status_code == 200, r.text
    ids = {row["id"] for row in r.json()}
    assert str(name_id) in ids
    assert str(location_id) in ids
    assert str(miss_id) not in ids


async def test_create_school_returns_new_row(authed_client):
    """POST /api/schools creates a school with required name and optional fields."""
    r = await authed_client.post(
        "/api/schools",
        json={
            "name": f"Created {uuid4()}",
            "location": "Clayton, MO",
            "website": "https://example.edu",
            "school_type": "independent",
        },
    )

    assert r.status_code == 201, r.text
    body = r.json()
    assert body["id"]
    assert body["location"] == "Clayton, MO"
    assert body["website"] == "https://example.edu"


async def test_create_school_requires_name(authed_client):
    """POST /api/schools requires name."""
    r = await authed_client.post("/api/schools", json={"location": "No name"})

    assert r.status_code == 422


async def test_create_school_rejects_invalid_website_schemes(authed_client):
    """POST /api/schools rejects non-http(s) website schemes."""
    for website in ("javascript:alert(1)", "data:text/html,x", "ftp://example.edu"):
        r = await authed_client.post(
            "/api/schools",
            json={"name": f"Bad website {uuid4()}", "website": website},
        )
        assert r.status_code == 422, f"{website} unexpectedly returned {r.status_code}"


async def test_school_detail_returns_related_arrays(
    authed_client, db_pool, test_user
):
    """GET /api/schools/{id} returns visits, recommendations, and staff arrays."""
    school_id = await _insert_school(db_pool, name=f"Detail {uuid4()}")
    artifact = await _insert_engagement_for_school_artifacts(db_pool, test_user)
    async with db_pool.acquire() as conn:
        visit_id = await conn.fetchval(
            """
            INSERT INTO school_visits (
              engagement_id, school_id, visit_date, attendees, facts_notes,
              opinion_notes, hours, created_by
            )
            VALUES ($1, $2, CURRENT_DATE, 'Parent', 'Facts', 'Opinion', 1.5, $3)
            RETURNING id
            """,
            artifact["engagement_id"],
            school_id,
            test_user["id"],
        )
        rec_id = await conn.fetchval(
            """
            INSERT INTO school_recommendations (engagement_id, school_id, rank, notes)
            VALUES ($1, $2, 1, 'Strong fit')
            RETURNING id
            """,
            artifact["engagement_id"],
            school_id,
        )
        staff_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, last_name, email)
            VALUES ('school_worker', 'Jane', 'School', 'jane@example.edu')
            RETURNING id
            """
        )
        await conn.execute(
            """
            INSERT INTO school_worker_details (person_id, school_id, role)
            VALUES ($1, $2, 'Director')
            """,
            staff_id,
            school_id,
        )

    r = await authed_client.get(f"/api/schools/{school_id}")

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == str(school_id)
    assert [v["id"] for v in body["visits"]] == [str(visit_id)]
    assert [rec["id"] for rec in body["recommendations"]] == [str(rec_id)]
    assert body["staff"][0]["id"] == str(staff_id)
    assert body["staff"][0]["role"] == "Director"


async def test_patch_school_updates_fields_and_empty_patch_returns_400(
    authed_client, db_pool
):
    """PATCH /api/schools/{id} updates fields and rejects an empty patch."""
    school_id = await _insert_school(db_pool, name=f"Patch {uuid4()}")

    empty = await authed_client.patch(f"/api/schools/{school_id}", json={})
    updated = await authed_client.patch(
        f"/api/schools/{school_id}",
        json={"location": "New location", "website": ""},
    )

    assert empty.status_code == 400
    assert updated.status_code == 200, updated.text
    assert updated.json()["location"] == "New location"
    assert updated.json()["website"] is None


async def test_delete_school_soft_deletes_and_hides_row(authed_client, db_pool):
    """DELETE /api/schools/{id} soft-deletes, list hides it, and detail 404s."""
    school_id = await _insert_school(db_pool, name=f"Delete {uuid4()}")

    r = await authed_client.delete(f"/api/schools/{school_id}")

    assert r.status_code == 204, r.text
    async with db_pool.acquire() as conn:
        deleted_at = await conn.fetchval(
            "SELECT deleted_at FROM schools WHERE id = $1",
            school_id,
        )
    assert deleted_at is not None
    detail = await authed_client.get(f"/api/schools/{school_id}")
    listing = await authed_client.get("/api/schools")
    assert detail.status_code == 404
    assert str(school_id) not in {row["id"] for row in listing.json()}


async def test_list_school_counts_reflect_visits_and_staff(
    authed_client, db_pool, test_user
):
    """School list rows include visit_count and contact_count rollups."""
    school_id = await _insert_school(db_pool, name=f"Counts {uuid4()}")
    artifact = await _insert_engagement_for_school_artifacts(db_pool, test_user)
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO school_visits (engagement_id, school_id, visit_date, created_by)
            VALUES ($1, $2, CURRENT_DATE, $3)
            """,
            artifact["engagement_id"],
            school_id,
            test_user["id"],
        )
        worker_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name)
            VALUES ('school_worker', 'Count Worker')
            RETURNING id
            """
        )
        await conn.execute(
            """
            INSERT INTO school_worker_details (person_id, school_id, role)
            VALUES ($1, $2, 'Counselor')
            """,
            worker_id,
            school_id,
        )

    r = await authed_client.get("/api/schools")

    assert r.status_code == 200, r.text
    row = next(row for row in r.json() if row["id"] == str(school_id))
    assert row["visit_count"] == 1
    assert row["contact_count"] == 1
