"""Learning supports (migration 0006): 504 plans + IEPs.

Coverage:
  - Create + list + detail + update + delete happy paths
  - At-most-one active per (student, type) — 504 and IEP can co-exist
  - school_id validation
  - Document attachment validates ownership (learning_support-only)
  - audit + updated_at triggers wired
"""
from uuid import uuid4

import pytest

# ---- Fixtures -----------------------------------------------------------

@pytest.fixture
async def student(db_pool):
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"Supports-{uuid4()}",
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
    return student_id


@pytest.fixture
async def school(db_pool):
    async with db_pool.acquire() as conn:
        sid = await conn.fetchval(
            "INSERT INTO schools (name) VALUES ($1) RETURNING id",
            f"School-{uuid4()}",
        )
    return sid


# ---- Create / list ------------------------------------------------------

async def test_create_504_plan(authed_client, student, school):
    r = await authed_client.post(f"/api/students/{student}/learning-supports", json={
        "type": "plan_504",
        "school_id": str(school),
        "effective_date": "2026-08-01",
        "review_date": "2027-08-01",
        "notes": "Extended time on tests",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["type"] == "plan_504"
    assert body["status"] == "active"
    assert body["school_id"] == str(school)
    assert body["effective_date"] == "2026-08-01"


async def test_create_iep_for_same_student_alongside_504(authed_client, student):
    """A student can have an active 504 AND an active IEP simultaneously
    — they're different programs."""
    a = await authed_client.post(f"/api/students/{student}/learning-supports", json={
        "type": "plan_504",
    })
    b = await authed_client.post(f"/api/students/{student}/learning-supports", json={
        "type": "iep",
    })
    assert a.status_code == 201
    assert b.status_code == 201


async def test_partial_unique_blocks_two_active_504s(authed_client, student):
    """Same type, same student, two active rows must conflict (409)."""
    r1 = await authed_client.post(f"/api/students/{student}/learning-supports", json={
        "type": "plan_504",
    })
    assert r1.status_code == 201

    r2 = await authed_client.post(f"/api/students/{student}/learning-supports", json={
        "type": "plan_504",
    })
    assert r2.status_code == 409
    assert "already exists" in r2.json()["detail"].lower()


async def test_expiring_old_record_unblocks_new_one(authed_client, student):
    """Two-step transition: PATCH the existing one to expired, then
    POST a fresh active replacement (e.g., school transfer)."""
    old_id = (await authed_client.post(
        f"/api/students/{student}/learning-supports", json={"type": "iep"},
    )).json()["id"]
    await authed_client.patch(f"/api/learning-supports/{old_id}", json={
        "status": "expired",
    })

    r = await authed_client.post(
        f"/api/students/{student}/learning-supports", json={"type": "iep"},
    )
    assert r.status_code == 201, r.text


async def test_list_returns_newest_first(authed_client, student):
    a_id = (await authed_client.post(
        f"/api/students/{student}/learning-supports", json={"type": "plan_504"},
    )).json()["id"]
    b_id = (await authed_client.post(
        f"/api/students/{student}/learning-supports", json={"type": "iep"},
    )).json()["id"]
    rows = (await authed_client.get(f"/api/students/{student}/learning-supports")).json()
    ids = [r["id"] for r in rows]
    assert ids[0] == b_id
    assert ids[-1] == a_id


# ---- Update -------------------------------------------------------------

async def test_update_dates_and_status(authed_client, student):
    sid = (await authed_client.post(
        f"/api/students/{student}/learning-supports", json={"type": "plan_504"},
    )).json()["id"]

    r = await authed_client.patch(f"/api/learning-supports/{sid}", json={
        "review_date": "2027-01-15",
        "expires_at": "2028-08-01",
        "notes": "Annual review scheduled",
    })
    assert r.status_code == 200, r.text
    assert r.json()["review_date"] == "2027-01-15"


async def test_update_school_id_validates(authed_client, student):
    sid = (await authed_client.post(
        f"/api/students/{student}/learning-supports", json={"type": "iep"},
    )).json()["id"]

    bogus = uuid4()
    r = await authed_client.patch(f"/api/learning-supports/{sid}", json={
        "school_id": str(bogus),
    })
    assert r.status_code == 400


# ---- Document ownership validation --------------------------------------

async def test_attaching_a_student_doc_to_a_support_is_400(
    authed_client, student, db_pool
):
    """A document_id owned by 'student' (or anything other than
    'learning_support') cannot be attached."""
    async with db_pool.acquire() as conn:
        doc_id = await conn.fetchval(
            """
            INSERT INTO documents (
              owner_type, owner_id, kind, filename, content_type, byte_size, s3_key
            ) VALUES ('student', $1, 'iep', 'iep.pdf', 'application/pdf', 1, $2)
            RETURNING id
            """,
            student, f"s3-{uuid4()}",
        )

    r = await authed_client.post(
        f"/api/students/{student}/learning-supports", json={
            "type": "iep",
            "document_id": str(doc_id),
        },
    )
    assert r.status_code == 400
    assert "owned by student" in r.json()["detail"].lower()


# ---- Delete -------------------------------------------------------------

async def test_delete_removes_row(authed_client, student):
    sid = (await authed_client.post(
        f"/api/students/{student}/learning-supports", json={"type": "plan_504"},
    )).json()["id"]
    r = await authed_client.delete(f"/api/learning-supports/{sid}")
    assert r.status_code == 204
    detail = await authed_client.get(f"/api/learning-supports/{sid}")
    assert detail.status_code == 404


# ---- Schema-level guards ------------------------------------------------

async def test_learning_supports_has_audit_and_updated_at_triggers(db_pool):
    async with db_pool.acquire() as conn:
        triggers = {
            r["tgname"]
            for r in await conn.fetch(
                """
                SELECT tgname FROM pg_trigger t
                JOIN pg_class c ON c.oid = t.tgrelid
                WHERE c.relname = 'learning_supports' AND NOT t.tgisinternal
                """
            )
        }
    assert "learning_supports_set_updated_at" in triggers
    assert "learning_supports_audit" in triggers
