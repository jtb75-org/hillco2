"""Tests for the cross-engagement followups list (GET /api/followups)."""
from datetime import date, timedelta
from uuid import uuid4


async def _make_engagement(db_pool, user_id):
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"Followup-Family-{uuid4()}",
        )
        student_id = await conn.fetchval(
            "INSERT INTO people (kind, first_name) VALUES ('student', 'Followup Kid') RETURNING id"
        )
        await conn.execute(
            "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
            family_id, student_id,
        )
        await conn.execute(
            "INSERT INTO student_details (person_id) VALUES ($1)", student_id,
        )
        engagement_id = await conn.fetchval(
            """
            INSERT INTO engagements (family_id, student_id, engagement_type, status, lead_consultant_id)
            VALUES ($1, $2, 'assessment', 'in_progress', $3)
            RETURNING id
            """,
            family_id, student_id, user_id,
        )
    return family_id, engagement_id


async def test_list_all_followups_defaults_and_overdue(authed_client, db_pool, test_user):
    """Default view = my open items; overdue=true narrows to open items
    past due — the dashboard-card definitions."""
    _, engagement_id = await _make_engagement(db_pool, test_user["id"])

    yesterday = (date.today() - timedelta(days=1)).isoformat()
    next_week = (date.today() + timedelta(days=7)).isoformat()

    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/followups",
        json={"title": "Overdue item", "due_date": yesterday},
    )
    assert r.status_code == 201, r.text
    overdue_id = r.json()["id"]

    r = await authed_client.post(
        f"/api/engagements/{engagement_id}/followups",
        json={"title": "Future item", "due_date": next_week},
    )
    assert r.status_code == 201, r.text
    future_id = r.json()["id"]

    # Mark the future one done → it must drop out of the default (open) view.
    r = await authed_client.post(
        f"/api/followups/{future_id}/status", json={"status": "done"}
    )
    assert r.status_code == 200

    r = await authed_client.get("/api/followups")
    assert r.status_code == 200
    ids = [row["id"] for row in r.json()]
    assert overdue_id in ids and future_id not in ids
    row = next(row for row in r.json() if row["id"] == overdue_id)
    assert row["household_name"].startswith("Followup-Family-")
    assert row["engagement_id"] == str(engagement_id)

    r = await authed_client.get("/api/followups", params={"overdue": "true"})
    assert r.status_code == 200
    ids = [row["id"] for row in r.json()]
    assert overdue_id in ids and future_id not in ids

    # status=all surfaces the done item again.
    r = await authed_client.get("/api/followups", params={"status": "all"})
    ids = [row["id"] for row in r.json()]
    assert overdue_id in ids and future_id in ids


async def test_list_all_followups_assignee_filter(authed_client, db_pool, test_user):
    """assignee=me (default) hides other users' items; assignee=all shows them."""
    _, engagement_id = await _make_engagement(db_pool, test_user["id"])

    async with db_pool.acquire() as conn:
        other_person = await conn.fetchval(
            "INSERT INTO people (kind, first_name) VALUES ('other', 'Other Consultant') RETURNING id"
        )
        other_followup = await conn.fetchval(
            """
            INSERT INTO followups (engagement_id, title, due_date, assignee_id, status, created_by)
            VALUES ($1, 'Someone else''s item', CURRENT_DATE, $2, 'open', $3)
            RETURNING id
            """,
            engagement_id, other_person, test_user["id"],
        )

    r = await authed_client.get("/api/followups")
    assert str(other_followup) not in [row["id"] for row in r.json()]

    r = await authed_client.get("/api/followups", params={"assignee": "all"})
    assert str(other_followup) in [row["id"] for row in r.json()]
