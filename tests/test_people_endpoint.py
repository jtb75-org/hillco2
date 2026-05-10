"""GET /api/people — unified address book reading the new spine.

Migration 0008 created `people` and backfilled it from parents /
students / contacts. This endpoint is the SPA's Contacts-page query
target. Coverage:
  - Returns guardians, students, school workers, and 'other' kinds
  - Resolves family context for guardians + students via the
    family_guardians / family_students junctions
  - Resolves school context for school_worker_details
  - Surfaces current_grade for students from student_details
  - kind filter narrows results
  - search filter is case-insensitive and matches first/last/email
  - 404 on unknown id
"""
from uuid import uuid4

import pytest

# ---- Fixtures ----------------------------------------------------------

@pytest.fixture
async def populated(db_pool):
    """Set up one of each kind so the endpoint has real rows to return."""
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"People-{uuid4()}",
        )
        school_id = await conn.fetchval(
            "INSERT INTO schools (name) VALUES ($1) RETURNING id",
            f"School-{uuid4()}",
        )

        guardian_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, last_name, email)
            VALUES ('guardian', 'Jane', 'Smith', 'jane@example.com')
            RETURNING id
            """
        )
        await conn.execute(
            "INSERT INTO family_guardians (family_id, person_id, relationship) VALUES ($1, $2, 'mom')",
            family_id, guardian_id,
        )

        student_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, last_name)
            VALUES ('student', 'Sammy', 'Smith')
            RETURNING id
            """
        )
        await conn.execute(
            "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
            family_id, student_id,
        )
        await conn.execute(
            "INSERT INTO student_details (person_id, current_grade) VALUES ($1, '8th')",
            student_id,
        )

        worker_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, last_name, email)
            VALUES ('school_worker', 'Pat', 'Principal', 'pat@school.example')
            RETURNING id
            """
        )
        await conn.execute(
            "INSERT INTO school_worker_details (person_id, school_id, role) VALUES ($1, $2, 'Principal')",
            worker_id, school_id,
        )

        other_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, last_name, email)
            VALUES ('other', 'Dr', 'Tutor', 'tutor@example.com')
            RETURNING id
            """
        )
    return {
        "family_id": family_id,
        "school_id": school_id,
        "ids": {
            "guardian": guardian_id,
            "student": student_id,
            "school_worker": worker_id,
            "other": other_id,
        },
    }


# ---- List endpoint -----------------------------------------------------

async def test_list_returns_all_kinds_with_context(authed_client, populated):
    r = await authed_client.get("/api/people")
    assert r.status_code == 200
    rows = r.json()
    by_id = {row["id"]: row for row in rows}

    g = by_id[str(populated["ids"]["guardian"])]
    assert g["kind"] == "guardian"
    assert g["family_id"] == str(populated["family_id"])
    assert g["family_household_name"].startswith("People-")
    assert g["school_id"] is None

    s = by_id[str(populated["ids"]["student"])]
    assert s["kind"] == "student"
    assert s["family_id"] == str(populated["family_id"])
    assert s["current_grade"] == "8th"

    w = by_id[str(populated["ids"]["school_worker"])]
    assert w["kind"] == "school_worker"
    assert w["school_id"] == str(populated["school_id"])
    assert w["school_name"].startswith("School-")
    assert w["family_id"] is None

    o = by_id[str(populated["ids"]["other"])]
    assert o["kind"] == "other"
    assert o["family_id"] is None
    assert o["school_id"] is None


async def test_kind_filter_narrows_results(authed_client, populated):
    r = await authed_client.get("/api/people", params={"kind": "student"})
    rows = r.json()
    target = str(populated["ids"]["student"])
    kinds = {row["kind"] for row in rows}
    assert kinds == {"student"}
    assert target in {row["id"] for row in rows}


async def test_search_matches_first_name_case_insensitive(authed_client, populated):
    r = await authed_client.get("/api/people", params={"search": "JANE"})
    rows = r.json()
    target = str(populated["ids"]["guardian"])
    assert target in {row["id"] for row in rows}


async def test_search_matches_email(authed_client, populated):
    r = await authed_client.get("/api/people", params={"search": "tutor@example"})
    rows = r.json()
    assert str(populated["ids"]["other"]) in {row["id"] for row in rows}


async def test_search_combines_with_kind_filter(authed_client, populated):
    """kind=student + search='Smith' returns the student-Smith only,
    not the guardian-Smith."""
    r = await authed_client.get(
        "/api/people",
        params={"kind": "student", "search": "smith"},
    )
    rows = r.json()
    ids = {row["id"] for row in rows}
    assert str(populated["ids"]["student"]) in ids
    assert str(populated["ids"]["guardian"]) not in ids


async def test_soft_deleted_people_excluded(authed_client, db_pool):
    async with db_pool.acquire() as conn:
        person_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, deleted_at)
            VALUES ('other', 'Ghost', NOW())
            RETURNING id
            """
        )
    r = await authed_client.get("/api/people")
    ids = {row["id"] for row in r.json()}
    assert str(person_id) not in ids


# ---- Detail endpoint ---------------------------------------------------

async def test_detail_returns_person(authed_client, populated):
    r = await authed_client.get(f"/api/people/{populated['ids']['guardian']}")
    assert r.status_code == 200
    body = r.json()
    assert body["first_name"] == "Jane"
    assert body["family_id"] == str(populated["family_id"])


async def test_detail_404_for_unknown(authed_client):
    r = await authed_client.get(f"/api/people/{uuid4()}")
    assert r.status_code == 404


async def test_detail_404_for_soft_deleted(authed_client, db_pool):
    async with db_pool.acquire() as conn:
        person_id = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, deleted_at)
            VALUES ('other', 'Ghost', NOW())
            RETURNING id
            """
        )
    r = await authed_client.get(f"/api/people/{person_id}")
    assert r.status_code == 404


# ---- Auth boundary -----------------------------------------------------

async def test_unauthenticated_request_is_401(client):
    r = await client.get("/api/people")
    assert r.status_code == 401
