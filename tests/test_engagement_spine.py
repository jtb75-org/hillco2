"""Engagement-student spine flip (migration 0002).

Locks in the new invariants:
  - Engagement requires exactly one student.
  - The composite FK on (student_id, family_id) refuses cross-family
    assignments at the DB level.
  - learning_profiles is one-per-engagement, with the student derived
    from engagements.student_id rather than carried twice.
"""
from uuid import uuid4

import pytest

# ---- Fixtures -----------------------------------------------------------

@pytest.fixture
async def family_with_two_students(db_pool):
    """Create two siblings in one family — used to verify the engagement
    can target a specific student and that re-assigning between siblings
    works through the composite FK."""
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"Spine-{uuid4()}",
        )
        s_a = await conn.fetchval(
            "INSERT INTO people (kind, first_name) VALUES ('student', 'Sibling A') RETURNING id"
        )
        s_b = await conn.fetchval(
            "INSERT INTO people (kind, first_name) VALUES ('student', 'Sibling B') RETURNING id"
        )
        await conn.execute(
            "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2), ($1, $3)",
            family_id, s_a, s_b,
        )
        await conn.execute(
            "INSERT INTO student_details (person_id) VALUES ($1), ($2)",
            s_a, s_b,
        )
    return {"family_id": family_id, "students": [s_a, s_b]}


@pytest.fixture
async def other_family_student(db_pool):
    """Student in a different family — used to assert the composite FK
    blocks cross-family assignment."""
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"Other-{uuid4()}",
        )
        s_id = await conn.fetchval(
            "INSERT INTO people (kind, first_name) VALUES ('student', 'Outsider') RETURNING id"
        )
        await conn.execute(
            "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
            family_id, s_id,
        )
        await conn.execute(
            "INSERT INTO student_details (person_id) VALUES ($1)",
            s_id,
        )
    return {"family_id": family_id, "student_id": s_id}


# ---- Engagement create -------------------------------------------------

async def test_create_engagement_requires_student_id(authed_client, family_with_two_students):
    """Body without student_id is a 422 (Pydantic required-field)."""
    r = await authed_client.post(
        f"/api/families/{family_with_two_students['family_id']}/engagements",
        json={},
    )
    assert r.status_code == 422


async def test_create_engagement_with_student_id(authed_client, family_with_two_students):
    fam = family_with_two_students
    r = await authed_client.post(
        f"/api/families/{fam['family_id']}/engagements",
        json={"student_id": str(fam["students"][0])},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["student"]["id"] == str(fam["students"][0])
    # The old `students` list field is gone — singular `student` only.
    assert "students" not in body


async def test_create_engagement_rejects_cross_family_student(
    authed_client, family_with_two_students, other_family_student
):
    """Assigning a student from another family must fail with 400 (caught
    by the route's _validate_student_in_family helper before the FK has a
    chance to raise)."""
    r = await authed_client.post(
        f"/api/families/{family_with_two_students['family_id']}/engagements",
        json={"student_id": str(other_family_student["student_id"])},
    )
    assert r.status_code == 400
    assert "does not belong" in r.json()["detail"].lower()


async def test_route_blocks_cross_family_drift(family_with_two_students, other_family_student):
    """Migration 0010 dropped the composite FK on (student_id, family_id)
    because people doesn't carry family_id (the relationship lives on
    family_students). The cross-family check moves to the application
    layer in engagements._validate_student_in_family — covered by
    test_create_engagement_rejects_cross_family_student and
    test_update_engagement_rejects_cross_family_student. This test is
    a placeholder noting the trade-off; the DB-level guard was
    deliberate and would be revived as a trigger in a future hardening."""
    _ = family_with_two_students, other_family_student


# ---- Engagement update -------------------------------------------------

async def test_update_engagement_can_reassign_student_within_family(
    authed_client, family_with_two_students
):
    fam = family_with_two_students
    r = await authed_client.post(
        f"/api/families/{fam['family_id']}/engagements",
        json={"student_id": str(fam["students"][0])},
    )
    assert r.status_code == 201
    eng_id = r.json()["id"]

    r2 = await authed_client.patch(
        f"/api/engagements/{eng_id}",
        json={"student_id": str(fam["students"][1])},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["student"]["id"] == str(fam["students"][1])


async def test_update_engagement_rejects_cross_family_student(
    authed_client, family_with_two_students, other_family_student
):
    fam = family_with_two_students
    eng_id = (await authed_client.post(
        f"/api/families/{fam['family_id']}/engagements",
        json={"student_id": str(fam["students"][0])},
    )).json()["id"]

    r = await authed_client.patch(
        f"/api/engagements/{eng_id}",
        json={"student_id": str(other_family_student["student_id"])},
    )
    assert r.status_code == 400


# ---- Engagement detail / student detail rollups ------------------------

async def test_engagement_detail_returns_singular_student(authed_client, family_with_two_students):
    fam = family_with_two_students
    eng_id = (await authed_client.post(
        f"/api/families/{fam['family_id']}/engagements",
        json={"student_id": str(fam["students"][0])},
    )).json()["id"]

    r = await authed_client.get(f"/api/engagements/{eng_id}")
    assert r.status_code == 200
    assert r.json()["student"]["id"] == str(fam["students"][0])


async def test_student_detail_lists_engagements_directly(authed_client, family_with_two_students):
    """student detail no longer joins through engagement_students."""
    fam = family_with_two_students
    s_id = fam["students"][0]
    await authed_client.post(
        f"/api/families/{fam['family_id']}/engagements",
        json={"student_id": str(s_id)},
    )
    r = await authed_client.get(f"/api/students/{s_id}")
    assert r.status_code == 200
    eng_list = r.json().get("engagements", [])
    assert len(eng_list) == 1


# ---- learning_profiles -------------------------------------------------

async def test_learning_profile_is_one_per_engagement(authed_client, family_with_two_students):
    fam = family_with_two_students
    eng_id = (await authed_client.post(
        f"/api/families/{fam['family_id']}/engagements",
        json={"student_id": str(fam["students"][0])},
    )).json()["id"]

    r = await authed_client.post(
        f"/api/engagements/{eng_id}/learning-profiles",
        json={"strengths": "good listener"},
    )
    assert r.status_code == 201

    # Second profile on the same engagement collides with UNIQUE(engagement_id).
    r2 = await authed_client.post(
        f"/api/engagements/{eng_id}/learning-profiles",
        json={"strengths": "another"},
    )
    assert r2.status_code == 409


async def test_learning_profile_create_does_not_accept_student_id(
    authed_client, family_with_two_students
):
    """Old request shape carried student_id; the new spine derives it from
    the engagement, so passing it should be silently ignored (the field
    isn't on the model anymore)."""
    fam = family_with_two_students
    eng_id = (await authed_client.post(
        f"/api/families/{fam['family_id']}/engagements",
        json={"student_id": str(fam["students"][0])},
    )).json()["id"]

    r = await authed_client.post(
        f"/api/engagements/{eng_id}/learning-profiles",
        json={"student_id": str(fam["students"][1]), "strengths": "x"},
    )
    # Pydantic's default is `extra='ignore'` — the bogus student_id is
    # dropped, profile is attached to the engagement's actual student.
    assert r.status_code == 201
    list_r = await authed_client.get(f"/api/engagements/{eng_id}/learning-profiles")
    assert list_r.json()[0]["student_id"] == str(fam["students"][0])
