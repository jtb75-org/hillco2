"""Intake Discovery backend coverage."""

import asyncio
import json
from pathlib import Path
from uuid import uuid4

import pytest

# ---- Helpers -------------------------------------------------------------


@pytest.fixture
async def family_with_two_students(db_pool):
    """Create two siblings in one family for intake conversion tests."""
    async with db_pool.acquire() as conn:
        family_id = await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"Discovery-{uuid4()}",
        )
        s_a = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, last_name)
            VALUES ('student', 'Discovery', 'A')
            RETURNING id
            """
        )
        s_b = await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, last_name)
            VALUES ('student', 'Discovery', 'B')
            RETURNING id
            """
        )
        await conn.execute(
            """
            INSERT INTO family_students (family_id, person_id)
            VALUES ($1, $2), ($1, $3)
            """,
            family_id, s_a, s_b,
        )
        await conn.execute(
            "INSERT INTO student_details (person_id) VALUES ($1), ($2)",
            s_a, s_b,
        )
    return {"family_id": family_id, "students": [s_a, s_b]}


async def _create_intake(authed_client, family_id, students=()):
    r = await authed_client.post(
        "/api/intakes",
        json={"family_id": str(family_id)},
    )
    assert r.status_code == 201, r.text
    intake = r.json()
    for student_id in students:
        link = await authed_client.post(
            f"/api/intakes/{intake['id']}/students",
            json={"person_id": str(student_id)},
        )
        assert link.status_code == 201, link.text
    return intake


async def _patch_intake_student(
    authed_client,
    intake_id,
    student_id,
    **payload,
):
    r = await authed_client.patch(
        f"/api/intakes/{intake_id}/students/{student_id}",
        json=payload,
    )
    assert r.status_code == 200, r.text
    return r.json()


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
    patch = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={
            "outcome": "converting",
            "desired_outcome": "Find a better school fit.",
            "constraints": ["commute", "budget"],
            "decision_makers": [{"name": "Parent One", "relation": "mom"}],
        },
    )
    assert patch.status_code == 200, patch.text
    for student_id in family["students"][:candidates]:
        await _patch_intake_student(
            authed_client,
            intake["id"],
            student_id,
            candidate=True,
            recommended_engagement_type=engagement_type,
            working="<p>Small classes</p>",
            not_working="<p>Current school is too large</p>",
            history="<p>Two prior moves</p>",
            school_fit="<p>Needs structure</p>",
            supports_tried="<p>Tutor</p>",
            mentions=[{"text": "Crossroads", "kind": "school"}],
        )
    return intake


async def _insert_engagement(
    db_pool,
    *,
    family_id,
    student_id,
    lead_consultant_id,
    engagement_type="assessment",
    status="in_progress",
    intake_id=None,
    deleted=False,
):
    async with db_pool.acquire() as conn:
        eng_id = await conn.fetchval(
            """
            INSERT INTO engagements (
              family_id, student_id, lead_consultant_id, engagement_type,
              status, intake_id, deleted_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN NOW() ELSE NULL END)
            RETURNING id
            """,
            family_id,
            student_id,
            lead_consultant_id,
            engagement_type,
            status,
            intake_id,
            deleted,
        )
    return eng_id


async def _family_stage(db_pool, family_id):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT lifecycle_stage FROM families WHERE id = $1",
            family_id,
        )


# ---- Field validation ----------------------------------------------------


async def test_referral_source_rejects_invalid_enum(
    authed_client, family_with_two_students
):
    """PATCH /api/intakes/{id} rejects referral_source outside the allowed enum."""
    intake = await _create_intake(authed_client, family_with_two_students["family_id"])
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"referral_source": "billboard"},
    )
    assert r.status_code == 422


async def test_outcome_rejects_invalid_enum(authed_client, family_with_two_students):
    """PATCH /api/intakes/{id} rejects outcome outside the allowed enum."""
    intake = await _create_intake(authed_client, family_with_two_students["family_id"])
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": "won"},
    )
    assert r.status_code == 422


async def test_next_step_owner_rejects_invalid_enum(
    authed_client, family_with_two_students
):
    """PATCH /api/intakes/{id} rejects next_step_owner outside the allowed enum."""
    intake = await _create_intake(authed_client, family_with_two_students["family_id"])
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"next_step_owner": "teacher"},
    )
    assert r.status_code == 422


async def test_decision_makers_jsonb_shape_enforced(
    authed_client, family_with_two_students
):
    """decision_makers requires shaped objects with a non-empty name."""
    intake = await _create_intake(authed_client, family_with_two_students["family_id"])
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"decision_makers": [{"relation": "mom"}]},
    )
    assert r.status_code == 422


async def test_mentions_jsonb_shape_enforced(
    authed_client, family_with_two_students
):
    """intake student mentions require non-empty text and a valid kind."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"], family["students"])
    invalid_kind = await authed_client.patch(
        f"/api/intakes/{intake['id']}/students/{family['students'][0]}",
        json={"mentions": [{"text": "Someone", "kind": "club"}]},
    )
    empty_text = await authed_client.patch(
        f"/api/intakes/{intake['id']}/students/{family['students'][0]}",
        json={"mentions": [{"text": "", "kind": "professional"}]},
    )
    assert invalid_kind.status_code == 422
    assert empty_text.status_code == 422


async def test_consent_granted_nullable_three_states(
    authed_client, family_with_two_students
):
    """consent_granted round-trips None, True, and False distinctly."""
    intake = await _create_intake(authed_client, family_with_two_students["family_id"])
    seen = []
    for value in (None, True, False):
        r = await authed_client.patch(
            f"/api/intakes/{intake['id']}",
            json={"consent_granted": value},
        )
        assert r.status_code == 200, r.text
        seen.append(r.json()["consent_granted"])
    assert seen == [None, True, False]


async def test_constraints_jsonb_round_trip(authed_client, family_with_two_students):
    """constraints JSONB chip values persist and round-trip unchanged."""
    intake = await _create_intake(authed_client, family_with_two_students["family_id"])
    constraints = ["commute", "budget", "schedule"]
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"constraints": constraints},
    )
    assert r.status_code == 200, r.text
    assert r.json()["constraints"] == constraints
    get_r = await authed_client.get(f"/api/intakes/{intake['id']}")
    assert get_r.status_code == 200
    assert get_r.json()["constraints"] == constraints


# ---- Outcome state transition -------------------------------------------


async def test_outcome_null_to_value_stamps_outcome_at_and_completed_at(
    authed_client, family_with_two_students
):
    """Setting outcome from null stamps both outcome_at and completed_at."""
    intake = await _create_intake(authed_client, family_with_two_students["family_id"])
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": "nurture"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["outcome"] == "nurture"
    assert body["outcome_at"]
    assert body["completed_at"]


async def test_outcome_value_to_null_clears_outcome_at_and_completed_at(
    authed_client, family_with_two_students
):
    """Clearing outcome clears both outcome_at and completed_at."""
    intake = await _create_intake(authed_client, family_with_two_students["family_id"])
    set_r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": "nurture"},
    )
    assert set_r.status_code == 200
    clear_r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": None},
    )
    assert clear_r.status_code == 200, clear_r.text
    body = clear_r.json()
    assert body["outcome"] is None
    assert body["outcome_at"] is None
    assert body["completed_at"] is None


async def test_outcome_transition_in_single_transaction(
    authed_client, family_with_two_students, monkeypatch
):
    """A mid-transition failure rolls back outcome, outcome_at, and completed_at together."""
    from app.routes import intakes as intakes_mod

    intake = await _create_intake(authed_client, family_with_two_students["family_id"])

    async def fail_lifecycle(*_args, **_kwargs):
        raise RuntimeError("forced lifecycle failure")

    monkeypatch.setattr(intakes_mod, "_flip_family_lifecycle", fail_lifecycle)
    with pytest.raises(RuntimeError, match="forced lifecycle failure"):
        await authed_client.patch(
            f"/api/intakes/{intake['id']}",
            json={"outcome": "nurture"},
        )

    get_r = await authed_client.get(f"/api/intakes/{intake['id']}")
    assert get_r.status_code == 200
    body = get_r.json()
    assert body["outcome"] is None
    assert body["outcome_at"] is None
    assert body["completed_at"] is None


# ---- Per-student discovery + candidacy ----------------------------------


async def test_intake_student_patch_updates_discovery_fields(
    authed_client, family_with_two_students
):
    """PATCH /api/intakes/{id}/students/{person_id} updates per-intake discovery fields."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"], family["students"])
    body = await _patch_intake_student(
        authed_client,
        intake["id"],
        family["students"][0],
        working="<p>Good rapport</p>",
        not_working="<p>Large class</p>",
        history="<p>Recent move</p>",
        school_fit="<p>Needs smaller program</p>",
        supports_tried="<p>Executive-function coach</p>",
        candidate=True,
        recommended_engagement_type="assessment",
        mentions=[{"text": "Dr. Smith", "kind": "professional"}],
    )
    assert body["working"] == "<p>Good rapport</p>"
    assert body["not_working"] == "<p>Large class</p>"
    assert body["history"] == "<p>Recent move</p>"
    assert body["school_fit"] == "<p>Needs smaller program</p>"
    assert body["supports_tried"] == "<p>Executive-function coach</p>"
    assert body["candidate"] is True
    assert body["recommended_engagement_type"] == "assessment"
    assert body["mentions"] == [{"text": "Dr. Smith", "kind": "professional"}]


async def test_intake_student_patch_rejects_student_not_linked_to_intake(
    authed_client, family_with_two_students
):
    """Student discovery PATCH rejects students not linked to the intake."""
    family = family_with_two_students
    intake = await _create_intake(
        authed_client,
        family["family_id"],
        [family["students"][0]],
    )
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}/students/{family['students'][1]}",
        json={"candidate": True},
    )
    assert r.status_code == 404


async def test_recommended_engagement_type_validated_against_engagement_types_catalog(
    authed_client, family_with_two_students
):
    """recommended_engagement_type must resolve to a live engagement_types code."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"], family["students"])
    valid = await authed_client.patch(
        f"/api/intakes/{intake['id']}/students/{family['students'][0]}",
        json={"recommended_engagement_type": "assessment"},
    )
    invalid = await authed_client.patch(
        f"/api/intakes/{intake['id']}/students/{family['students'][0]}",
        json={"recommended_engagement_type": "not_real"},
    )
    assert valid.status_code == 200, valid.text
    assert invalid.status_code == 400


async def test_recommended_engagement_type_rejects_soft_deleted_code(
    authed_client, db_pool, family_with_two_students
):
    """recommended_engagement_type rejects soft-deleted engagement_types codes."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"], family["students"])
    code = f"soft_deleted_{uuid4().hex}"
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO engagement_types (code, label, deleted_at)
            VALUES ($1, 'Soft deleted', NOW())
            """,
            code,
        )
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}/students/{family['students'][0]}",
        json={"recommended_engagement_type": code},
    )
    assert r.status_code == 400


# ---- Convert flow --------------------------------------------------------


async def test_convert_requires_outcome_converting(
    authed_client, family_with_two_students
):
    """POST /api/intakes/{id}/convert requires outcome='converting'."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"], family["students"])
    await _patch_intake_student(
        authed_client,
        intake["id"],
        family["students"][0],
        candidate=True,
        recommended_engagement_type="assessment",
    )
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 400
    assert "outcome" in r.json()["detail"].lower()


async def test_convert_requires_at_least_one_candidate(
    authed_client, family_with_two_students
):
    """Convert rejects intakes with no candidate students."""
    intake = await _create_intake(
        authed_client,
        family_with_two_students["family_id"],
        family_with_two_students["students"],
    )
    outcome = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": "converting"},
    )
    assert outcome.status_code == 200
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 400
    assert "candidate" in r.json()["detail"].lower()


async def test_convert_requires_recommended_engagement_type_per_candidate(
    authed_client, family_with_two_students
):
    """Convert rejects candidates missing recommended_engagement_type."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"], family["students"])
    outcome = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": "converting"},
    )
    assert outcome.status_code == 200
    await _patch_intake_student(
        authed_client,
        intake["id"],
        family["students"][0],
        candidate=True,
    )
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 400
    assert "recommended_engagement_type" in r.json()["detail"]


async def test_convert_creates_one_engagement_per_candidate(
    authed_client, family_with_two_students
):
    """Convert creates exactly one engagement for each candidate student."""
    intake = await _prepare_converting_intake(
        authed_client,
        family_with_two_students,
        candidates=2,
    )
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 200, r.text
    assert len(r.json()["engagement_ids"]) == 2


async def test_convert_engagement_status_is_in_progress(
    authed_client, db_pool, family_with_two_students
):
    """Convert-created engagements use status='in_progress', not a nonexistent lead status."""
    intake = await _prepare_converting_intake(authed_client, family_with_two_students)
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 200, r.text
    eng_id = r.json()["engagement_ids"][0]
    async with db_pool.acquire() as conn:
        status = await conn.fetchval("SELECT status FROM engagements WHERE id = $1", eng_id)
    assert status == "in_progress"


async def test_convert_snapshots_discovery_context_into_intake_snapshot(
    authed_client, db_pool, family_with_two_students
):
    """Convert copies discovery context into engagements.intake_snapshot."""
    intake = await _prepare_converting_intake(authed_client, family_with_two_students)
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 200, r.text
    eng_id = r.json()["engagement_ids"][0]
    async with db_pool.acquire() as conn:
        snapshot = await conn.fetchval(
            "SELECT intake_snapshot FROM engagements WHERE id = $1",
            eng_id,
        )
    snap = json.loads(snapshot) if isinstance(snapshot, str) else snapshot
    assert snap["family"]["desired_outcome"] == "Find a better school fit."
    assert snap["family"]["constraints"] == ["commute", "budget"]
    assert snap["student"]["working"] == "<p>Small classes</p>"
    assert snap["student"]["mentions"] == [{"text": "Crossroads", "kind": "school"}]


async def test_convert_snapshot_records_source_intake_and_timestamp(
    authed_client, db_pool, family_with_two_students
):
    """intake_snapshot records the source intake id and snapshot timestamp."""
    intake = await _prepare_converting_intake(authed_client, family_with_two_students)
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 200, r.text
    async with db_pool.acquire() as conn:
        snapshot = await conn.fetchval(
            "SELECT intake_snapshot FROM engagements WHERE id = $1",
            r.json()["engagement_ids"][0],
        )
    snap = json.loads(snapshot) if isinstance(snapshot, str) else snapshot
    assert snap["intake_id"] == intake["id"]
    assert snap["snapshotted_at"]


async def test_convert_is_idempotent_via_converted_at(
    authed_client, family_with_two_students
):
    """A converted_at guard prevents repeat conversion of the same intake."""
    intake = await _prepare_converting_intake(authed_client, family_with_two_students)
    first = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    second = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert first.status_code == 200, first.text
    assert second.status_code == 409


async def test_convert_rejects_duplicate_active_engagement_for_same_intake_student_type(
    authed_client, db_pool, family_with_two_students, test_user
):
    """Convert rejects an existing active engagement for the same intake, student, and type."""
    family = family_with_two_students
    intake = await _prepare_converting_intake(authed_client, family)
    await _insert_engagement(
        db_pool,
        family_id=family["family_id"],
        student_id=family["students"][0],
        lead_consultant_id=test_user["id"],
        engagement_type="assessment",
        status="in_progress",
    )
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 409
    assert "active" in r.json()["detail"].lower()


async def test_convert_allows_inactive_duplicate_engagement_for_same_student_type(
    authed_client, db_pool, family_with_two_students, test_user
):
    """Completed or cancelled prior engagements do not trip the active duplicate guard."""
    family = family_with_two_students
    intake = await _prepare_converting_intake(authed_client, family)
    await _insert_engagement(
        db_pool,
        family_id=family["family_id"],
        student_id=family["students"][0],
        lead_consultant_id=test_user["id"],
        status="completed",
    )
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 200, r.text
    assert len(r.json()["engagement_ids"]) == 1


async def test_convert_concurrent_requests_create_no_duplicates(
    authed_client, db_pool, family_with_two_students
):
    """Concurrent convert requests create exactly one engagement per candidate."""
    intake = await _prepare_converting_intake(
        authed_client,
        family_with_two_students,
        candidates=2,
    )
    responses = await asyncio.gather(
        authed_client.post(f"/api/intakes/{intake['id']}/convert"),
        authed_client.post(f"/api/intakes/{intake['id']}/convert"),
    )
    statuses = sorted(r.status_code for r in responses)
    assert statuses == [200, 409]
    async with db_pool.acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM engagements WHERE intake_id = $1 AND deleted_at IS NULL",
            intake["id"],
        )
    assert count == 2


async def test_convert_flips_family_lifecycle_to_client(
    authed_client, db_pool, family_with_two_students
):
    """Successful convert flips the family lifecycle_stage to client."""
    intake = await _prepare_converting_intake(authed_client, family_with_two_students)
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 200, r.text
    assert await _family_stage(db_pool, family_with_two_students["family_id"]) == "client"


# ---- Existing-engagement bake-in on intake GET --------------------------


async def test_intake_get_includes_active_engagements_per_candidate(
    authed_client, db_pool, family_with_two_students, test_user
):
    """GET intake includes in_progress and on_hold engagements per candidate."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"], family["students"])
    await _insert_engagement(
        db_pool,
        family_id=family["family_id"],
        student_id=family["students"][0],
        lead_consultant_id=test_user["id"],
        status="in_progress",
    )
    await _insert_engagement(
        db_pool,
        family_id=family["family_id"],
        student_id=family["students"][0],
        lead_consultant_id=test_user["id"],
        engagement_type="full_placement",
        status="on_hold",
    )
    r = await authed_client.get(f"/api/intakes/{intake['id']}")
    assert r.status_code == 200, r.text
    student = next(s for s in r.json()["students"] if s["id"] == str(family["students"][0]))
    assert {e["status"] for e in student["existing_engagements"]} == {
        "in_progress",
        "on_hold",
    }


async def test_intake_get_excludes_cancelled_and_completed_engagements_from_active_list(
    authed_client, db_pool, family_with_two_students, test_user
):
    """GET intake excludes cancelled and completed engagements from existing_engagements."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"], family["students"])
    for status in ("cancelled", "completed"):
        await _insert_engagement(
            db_pool,
            family_id=family["family_id"],
            student_id=family["students"][0],
            lead_consultant_id=test_user["id"],
            status=status,
        )
    r = await authed_client.get(f"/api/intakes/{intake['id']}")
    assert r.status_code == 200, r.text
    student = next(s for s in r.json()["students"] if s["id"] == str(family["students"][0]))
    assert student["existing_engagements"] == []


async def test_intake_get_omits_soft_deleted_engagements_from_active_list(
    authed_client, db_pool, family_with_two_students, test_user
):
    """GET intake omits soft-deleted engagements from existing_engagements."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"], family["students"])
    await _insert_engagement(
        db_pool,
        family_id=family["family_id"],
        student_id=family["students"][0],
        lead_consultant_id=test_user["id"],
        deleted=True,
    )
    r = await authed_client.get(f"/api/intakes/{intake['id']}")
    assert r.status_code == 200, r.text
    student = next(s for s in r.json()["students"] if s["id"] == str(family["students"][0]))
    assert student["existing_engagements"] == []


# ---- Family lifecycle auto-flips ----------------------------------------


async def test_decline_outcome_flips_lead_family_to_archived(
    authed_client, db_pool, family_with_two_students
):
    """Declined outcomes archive a lead family only when it has zero active engagements."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"])
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": "declined_by_family"},
    )
    assert r.status_code == 200, r.text
    assert await _family_stage(db_pool, family["family_id"]) == "archived"


async def test_nurture_outcome_flips_lead_family_to_prospect(
    authed_client, db_pool, family_with_two_students
):
    """A nurture outcome flips a lead family to prospect."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"])
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": "nurture"},
    )
    assert r.status_code == 200, r.text
    assert await _family_stage(db_pool, family["family_id"]) == "prospect"


async def test_convert_success_flips_family_to_client(
    authed_client, db_pool, family_with_two_students
):
    """Successful convert flips the family lifecycle_stage to client."""
    intake = await _prepare_converting_intake(authed_client, family_with_two_students)
    r = await authed_client.post(f"/api/intakes/{intake['id']}/convert")
    assert r.status_code == 200, r.text
    assert await _family_stage(db_pool, family_with_two_students["family_id"]) == "client"


async def test_outcome_reversal_does_not_auto_revert_family_stage(
    authed_client, db_pool, family_with_two_students
):
    """Clearing or changing outcome does not automatically reverse family lifecycle_stage."""
    family = family_with_two_students
    intake = await _create_intake(authed_client, family["family_id"])
    first = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": "nurture"},
    )
    assert first.status_code == 200
    clear = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": None},
    )
    assert clear.status_code == 200
    assert await _family_stage(db_pool, family["family_id"]) == "prospect"


async def test_archived_decline_does_not_override_family_with_active_engagements(
    authed_client, db_pool, family_with_two_students, test_user
):
    """Declined outcome does not archive a family that already has active engagements."""
    family = family_with_two_students
    await _insert_engagement(
        db_pool,
        family_id=family["family_id"],
        student_id=family["students"][0],
        lead_consultant_id=test_user["id"],
        status="in_progress",
    )
    async with db_pool.acquire() as conn:
        await conn.execute(
            "UPDATE families SET lifecycle_stage = 'client' WHERE id = $1",
            family["family_id"],
        )
    intake = await _create_intake(authed_client, family["family_id"])
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"outcome": "declined_by_hillco"},
    )
    assert r.status_code == 200, r.text
    assert await _family_stage(db_pool, family["family_id"]) == "client"


# ---- Legacy notes / migration compatibility -----------------------------


async def test_existing_notes_remain_in_intake_notes_bucket(
    authed_client, family_with_two_students
):
    """Legacy intakes.notes is preserved as the general intake notes bucket."""
    intake = await _create_intake(authed_client, family_with_two_students["family_id"])
    r = await authed_client.patch(
        f"/api/intakes/{intake['id']}",
        json={"notes": "<p>Legacy note</p>", "family_context_notes": "<p>Context</p>"},
    )
    assert r.status_code == 200, r.text
    get_r = await authed_client.get(f"/api/intakes/{intake['id']}")
    assert get_r.status_code == 200
    body = get_r.json()
    assert body["notes"] == "<p>Legacy note</p>"
    assert body["family_context_notes"] == "<p>Context</p>"


# ---- Migration / backfill ------------------------------------------------


def test_backfill_completed_with_engagement_sets_outcome_converting():
    """Backfill maps completed intakes with engagement records to outcome='converting'."""
    text = Path("alembic/versions/0009_intake_discovery.py").read_text()
    assert "outcome = 'converting'" in text
    assert "converted_at = i.completed_at" in text
    assert "EXISTS (\n              SELECT 1 FROM engagements e" in text


def test_backfill_completed_without_engagement_sets_outcome_no_response():
    """Backfill maps completed intakes without engagement records to outcome='no_response'."""
    text = Path("alembic/versions/0009_intake_discovery.py").read_text()
    assert "outcome = 'no_response'" in text
    assert "i.outcome IS NULL" in text


def test_backfill_families_with_engagement_become_client():
    """Backfill sets families with existing engagements to lifecycle_stage='client'."""
    text = Path("alembic/versions/0009_intake_discovery.py").read_text()
    assert "SET lifecycle_stage = 'client'" in text
    assert "SELECT 1 FROM engagements e" in text


async def test_backfill_families_without_engagement_stay_lead(
    db_pool, family_with_two_students
):
    """Backfill leaves families without existing engagements at lifecycle_stage='lead'."""
    assert await _family_stage(db_pool, family_with_two_students["family_id"]) == "lead"
