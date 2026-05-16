"""Delete/archive cascade contracts.

These integration tests cover the edge cases where soft-deleted rows,
financial records, auth identities, and family junctions interact with
delete handlers.
"""

from uuid import uuid4

# ---- Helpers -------------------------------------------------------------


async def _create_family(db_pool, *, name_prefix="Cascade"):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
            f"{name_prefix}-{uuid4()}",
        )


async def _create_person(db_pool, *, kind="other", first_name="Cascade", deleted=False):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            """
            INSERT INTO people (kind, first_name, deleted_at)
            VALUES ($1, $2, CASE WHEN $3 THEN NOW() ELSE NULL END)
            RETURNING id
            """,
            kind,
            first_name,
            deleted,
        )


async def _create_family_member_set(db_pool):
    family_id = await _create_family(db_pool)
    guardian_id = await _create_person(db_pool, kind="guardian", first_name="Guardian")
    student_id = await _create_person(db_pool, kind="student", first_name="Student")
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO family_guardians (family_id, person_id, relationship)
            VALUES ($1, $2, 'guardian')
            """,
            family_id,
            guardian_id,
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
    return {
        "family_id": family_id,
        "guardian_id": guardian_id,
        "student_id": student_id,
    }


async def _create_engagement(
    db_pool,
    test_user,
    *,
    family_id=None,
    student_id=None,
    deleted=False,
    status="in_progress",
    intake_id=None,
):
    if family_id is None or student_id is None:
        family = await _create_family_member_set(db_pool)
        family_id = family["family_id"]
        student_id = family["student_id"]

    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            """
            INSERT INTO engagements (
              family_id, student_id, lead_consultant_id, engagement_type,
              status, intake_id, deleted_at
            )
            VALUES (
              $1, $2, $3, 'assessment', $4, $5,
              CASE WHEN $6 THEN NOW() ELSE NULL END
            )
            RETURNING id
            """,
            family_id,
            student_id,
            test_user["id"],
            status,
            intake_id,
            deleted,
        )


async def _create_intake(authed_client, family_id, *, outcome=None):
    r = await authed_client.post(
        "/api/intakes",
        json={"family_id": str(family_id)},
    )
    assert r.status_code == 201, r.text
    intake = r.json()
    if outcome is not None:
        patch = await authed_client.patch(
            f"/api/intakes/{intake['id']}",
            json={"outcome": outcome},
        )
        assert patch.status_code == 200, patch.text
        intake = patch.json()
    return intake


async def _insert_agreement(db_pool, engagement_id, test_user):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            """
            INSERT INTO agreements (engagement_id, type, status, created_by)
            VALUES ($1, 'services_contract', 'draft', $2)
            RETURNING id
            """,
            engagement_id,
            test_user["id"],
        )


async def _insert_invoice(db_pool, engagement_id, test_user):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            """
            INSERT INTO invoices (
              invoice_number, engagement_id, status, subtotal, tax, total,
              created_by
            )
            VALUES ($1, $2, 'draft', 0, 0, 0, $3)
            RETURNING id
            """,
            f"INV-{uuid4()}",
            engagement_id,
            test_user["id"],
        )


async def _exists(db_pool, table, row_id):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(f"SELECT 1 FROM {table} WHERE id = $1", row_id)


async def _person_deleted_at(db_pool, person_id):
    async with db_pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT deleted_at FROM people WHERE id = $1",
            person_id,
        )


# ---- Family hard-delete --------------------------------------------------


async def test_family_hard_delete_clean_family_no_engagements(authed_client, db_pool):
    """A family with no engagements can be hard-deleted."""
    family_id = await _create_family(db_pool)
    r = await authed_client.post(f"/api/families/{family_id}/hard-delete", json={})
    assert r.status_code == 204, r.text
    assert await _exists(db_pool, "families", family_id) is None


async def test_family_hard_delete_active_engagement_blocks(
    authed_client, db_pool, test_user
):
    """A live engagement blocks family hard-delete with a clear 409."""
    family = await _create_family_member_set(db_pool)
    await _create_engagement(
        db_pool,
        test_user,
        family_id=family["family_id"],
        student_id=family["student_id"],
    )
    r = await authed_client.post(
        f"/api/families/{family['family_id']}/hard-delete",
        json={},
    )
    assert r.status_code == 409
    assert "active engagement(s) still reference" in r.json()["detail"]


async def test_family_hard_delete_sweeps_archived_engagement(
    authed_client, db_pool, test_user
):
    """Archived engagements without billing records are hard-deleted during family delete."""
    family = await _create_family_member_set(db_pool)
    engagement_id = await _create_engagement(
        db_pool,
        test_user,
        family_id=family["family_id"],
        student_id=family["student_id"],
        deleted=True,
    )
    r = await authed_client.post(
        f"/api/families/{family['family_id']}/hard-delete",
        json={},
    )
    assert r.status_code == 204, r.text
    assert await _exists(db_pool, "engagements", engagement_id) is None
    assert await _exists(db_pool, "families", family["family_id"]) is None


async def test_family_hard_delete_archived_engagement_with_agreement_blocks(
    authed_client, db_pool, test_user
):
    """Archived engagements with agreements block family hard-delete."""
    family = await _create_family_member_set(db_pool)
    engagement_id = await _create_engagement(
        db_pool,
        test_user,
        family_id=family["family_id"],
        student_id=family["student_id"],
        deleted=True,
    )
    await _insert_agreement(db_pool, engagement_id, test_user)
    r = await authed_client.post(
        f"/api/families/{family['family_id']}/hard-delete",
        json={},
    )
    assert r.status_code == 409
    assert "soft-deleted engagement(s) still carry agreements or invoices" in (
        r.json()["detail"]
    )


async def test_family_hard_delete_archived_engagement_with_invoice_blocks(
    authed_client, db_pool, test_user
):
    """Archived engagements with invoices block family hard-delete."""
    family = await _create_family_member_set(db_pool)
    engagement_id = await _create_engagement(
        db_pool,
        test_user,
        family_id=family["family_id"],
        student_id=family["student_id"],
        deleted=True,
    )
    await _insert_invoice(db_pool, engagement_id, test_user)
    r = await authed_client.post(
        f"/api/families/{family['family_id']}/hard-delete",
        json={},
    )
    assert r.status_code == 409
    assert "soft-deleted engagement(s) still carry agreements or invoices" in (
        r.json()["detail"]
    )


async def test_family_hard_delete_sweeps_soft_deleted_guardian_junction(
    authed_client, db_pool
):
    """A soft-deleted guardian on the junction is swept silently."""
    family_id = await _create_family(db_pool)
    guardian_id = await _create_person(
        db_pool, kind="guardian", first_name="Deleted Guardian", deleted=True
    )
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO family_guardians (family_id, person_id, relationship)
            VALUES ($1, $2, 'guardian')
            """,
            family_id,
            guardian_id,
        )
    r = await authed_client.post(f"/api/families/{family_id}/hard-delete", json={})
    assert r.status_code == 204, r.text
    assert await _exists(db_pool, "families", family_id) is None


async def test_family_hard_delete_preserves_listed_people_and_soft_deletes_others(
    authed_client, db_pool
):
    """preserve_* ids keep listed people and soft-delete unlisted family members."""
    family_id = await _create_family(db_pool)
    keep_guardian = await _create_person(db_pool, kind="guardian", first_name="Keep G")
    drop_guardian = await _create_person(db_pool, kind="guardian", first_name="Drop G")
    keep_student = await _create_person(db_pool, kind="student", first_name="Keep S")
    drop_student = await _create_person(db_pool, kind="student", first_name="Drop S")
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO family_guardians (family_id, person_id, relationship)
            VALUES ($1, $2, 'guardian'), ($1, $3, 'guardian')
            """,
            family_id,
            keep_guardian,
            drop_guardian,
        )
        await conn.execute(
            """
            INSERT INTO family_students (family_id, person_id)
            VALUES ($1, $2), ($1, $3)
            """,
            family_id,
            keep_student,
            drop_student,
        )
    r = await authed_client.post(
        f"/api/families/{family_id}/hard-delete",
        json={
            "preserve_guardian_ids": [str(keep_guardian)],
            "preserve_student_ids": [str(keep_student)],
        },
    )
    assert r.status_code == 204, r.text
    assert await _person_deleted_at(db_pool, keep_guardian) is None
    assert await _person_deleted_at(db_pool, keep_student) is None
    assert await _person_deleted_at(db_pool, drop_guardian) is not None
    assert await _person_deleted_at(db_pool, drop_student) is not None


# ---- Engagement delete ---------------------------------------------------


async def test_engagement_delete_clean_engagement_hard_deletes(
    authed_client, db_pool, test_user
):
    """A clean engagement can be hard-deleted."""
    engagement_id = await _create_engagement(db_pool, test_user)
    r = await authed_client.delete(f"/api/engagements/{engagement_id}")
    assert r.status_code == 204, r.text
    assert await _exists(db_pool, "engagements", engagement_id) is None


async def test_engagement_delete_with_tasks_cascades_tasks(
    authed_client, db_pool, test_user
):
    """Engagement tasks cascade when the engagement is hard-deleted."""
    engagement_id = await _create_engagement(db_pool, test_user)
    async with db_pool.acquire() as conn:
        task_id = await conn.fetchval(
            """
            INSERT INTO engagement_tasks (engagement_id, title, created_by)
            VALUES ($1, 'Task to cascade', $2)
            RETURNING id
            """,
            engagement_id,
            test_user["id"],
        )
    r = await authed_client.delete(f"/api/engagements/{engagement_id}")
    assert r.status_code == 204, r.text
    assert await _exists(db_pool, "engagement_tasks", task_id) is None


async def test_engagement_delete_with_agreement_returns_409(
    authed_client, db_pool, test_user
):
    """Agreements FK-restrict engagement hard-delete."""
    engagement_id = await _create_engagement(db_pool, test_user)
    await _insert_agreement(db_pool, engagement_id, test_user)
    r = await authed_client.delete(f"/api/engagements/{engagement_id}")
    assert r.status_code == 409
    assert "dependent records" in r.json()["detail"]


async def test_engagement_delete_with_invoice_returns_409(
    authed_client, db_pool, test_user
):
    """Invoices FK-restrict engagement hard-delete."""
    engagement_id = await _create_engagement(db_pool, test_user)
    await _insert_invoice(db_pool, engagement_id, test_user)
    r = await authed_client.delete(f"/api/engagements/{engagement_id}")
    assert r.status_code == 409
    assert "dependent records" in r.json()["detail"]


# ---- Person delete -------------------------------------------------------


async def test_person_delete_ad_hoc_no_auth(authed_client, db_pool):
    """An ad-hoc person without auth can be soft-deleted."""
    person_id = await _create_person(db_pool, kind="other", first_name="Ad Hoc")
    r = await authed_client.delete(f"/api/people/{person_id}")
    assert r.status_code == 204, r.text
    assert await _person_deleted_at(db_pool, person_id) is not None


async def test_person_delete_self_rejected(authed_client, test_user):
    """A caller cannot delete their own account."""
    r = await authed_client.delete(f"/api/people/{test_user['id']}")
    assert r.status_code == 400
    assert "can't delete your own account" in r.json()["detail"]


async def test_person_delete_staff_auth_identity_rejected(authed_client, db_pool):
    """Staff people with auth identities must be deactivated via Admin Users."""
    staff_id = await _create_person(db_pool, kind="other", first_name="Staff")
    email = f"staff-{uuid4()}@example.com"
    async with db_pool.acquire() as conn:
        await conn.execute("UPDATE people SET email = $2 WHERE id = $1", staff_id, email)
        await conn.execute(
            "INSERT INTO auth (person_id, status, app_role) VALUES ($1, 'active', 'admin')",
            staff_id,
        )
        await conn.execute(
            """
            INSERT INTO auth_identities (person_id, provider, provider_subject)
            VALUES ($1, 'google', $2)
            """,
            staff_id,
            email,
        )
    r = await authed_client.delete(f"/api/people/{staff_id}")
    assert r.status_code == 400
    assert "Deactivate via Admin" in r.json()["detail"]


async def test_person_delete_guardian_on_live_family_keeps_junction(
    authed_client, db_pool
):
    """Deleting a guardian soft-deletes the person but keeps the family junction."""
    family = await _create_family_member_set(db_pool)
    r = await authed_client.delete(f"/api/people/{family['guardian_id']}")
    assert r.status_code == 204, r.text
    assert await _person_deleted_at(db_pool, family["guardian_id"]) is not None
    async with db_pool.acquire() as conn:
        linked = await conn.fetchval(
            """
            SELECT 1 FROM family_guardians
            WHERE family_id = $1 AND person_id = $2
            """,
            family["family_id"],
            family["guardian_id"],
        )
    assert linked == 1


async def test_person_delete_student_soft_deletes(authed_client, db_pool):
    """Deleting a student soft-deletes the people row."""
    family = await _create_family_member_set(db_pool)
    r = await authed_client.delete(f"/api/people/{family['student_id']}")
    assert r.status_code == 204, r.text
    assert await _person_deleted_at(db_pool, family["student_id"]) is not None


# ---- Contact delete ------------------------------------------------------


async def test_contact_delete_clean_ad_hoc_other(authed_client, db_pool):
    """A clean ad-hoc contact can be soft-deleted."""
    person_id = await _create_person(db_pool, kind="other", first_name="Contact")
    r = await authed_client.delete(f"/api/contacts/{person_id}")
    assert r.status_code == 204, r.text
    assert await _person_deleted_at(db_pool, person_id) is not None


async def test_contact_delete_staff_filtered_as_404(authed_client, db_pool):
    """Contacts endpoint filters staff out before delete, returning 404."""
    staff_id = await _create_person(db_pool, kind="other", first_name="Contact Staff")
    email = f"contact-staff-{uuid4()}@example.com"
    async with db_pool.acquire() as conn:
        await conn.execute("UPDATE people SET email = $2 WHERE id = $1", staff_id, email)
        await conn.execute(
            "INSERT INTO auth (person_id, status, app_role) VALUES ($1, 'active', 'admin')",
            staff_id,
        )
        await conn.execute(
            """
            INSERT INTO auth_identities (person_id, provider, provider_subject)
            VALUES ($1, 'google', $2)
            """,
            staff_id,
            email,
        )
    r = await authed_client.delete(f"/api/contacts/{staff_id}")
    assert r.status_code == 404


async def test_contact_delete_school_worker(authed_client, db_pool):
    """A school worker contact can be soft-deleted."""
    worker_id = await _create_person(db_pool, kind="school_worker", first_name="Worker")
    async with db_pool.acquire() as conn:
        school_id = await conn.fetchval(
            "INSERT INTO schools (name) VALUES ($1) RETURNING id",
            f"School-{uuid4()}",
        )
        await conn.execute(
            """
            INSERT INTO school_worker_details (person_id, school_id, role)
            VALUES ($1, $2, 'Director')
            """,
            worker_id,
            school_id,
        )
    r = await authed_client.delete(f"/api/contacts/{worker_id}")
    assert r.status_code == 204, r.text
    assert await _person_deleted_at(db_pool, worker_id) is not None


# ---- Intake delete -------------------------------------------------------


async def test_intake_delete_clean_intake(authed_client, db_pool):
    """A clean intake can be soft-deleted."""
    family_id = await _create_family(db_pool)
    intake = await _create_intake(authed_client, family_id)
    r = await authed_client.delete(f"/api/intakes/{intake['id']}")
    assert r.status_code == 204, r.text
    async with db_pool.acquire() as conn:
        deleted_at = await conn.fetchval(
            "SELECT deleted_at FROM intakes WHERE id = $1",
            intake["id"],
        )
    assert deleted_at is not None


async def test_intake_delete_detaches_associated_engagements(
    authed_client, db_pool, test_user
):
    """Deleting an intake clears engagement.intake_id links."""
    family = await _create_family_member_set(db_pool)
    intake = await _create_intake(authed_client, family["family_id"])
    engagement_id = await _create_engagement(
        db_pool,
        test_user,
        family_id=family["family_id"],
        student_id=family["student_id"],
        intake_id=intake["id"],
    )
    r = await authed_client.delete(f"/api/intakes/{intake['id']}")
    assert r.status_code == 204, r.text
    async with db_pool.acquire() as conn:
        intake_id = await conn.fetchval(
            "SELECT intake_id FROM engagements WHERE id = $1",
            engagement_id,
        )
    assert intake_id is None


async def test_intake_delete_preserves_outcome(authed_client, db_pool):
    """Soft-deleting an intake preserves its outcome fields."""
    family_id = await _create_family(db_pool)
    intake = await _create_intake(authed_client, family_id, outcome="no_response")
    r = await authed_client.delete(f"/api/intakes/{intake['id']}")
    assert r.status_code == 204, r.text
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT outcome, outcome_at, completed_at, deleted_at FROM intakes WHERE id = $1",
            intake["id"],
        )
    assert row["deleted_at"] is not None
    assert row["outcome"] == "no_response"
    assert row["outcome_at"] is not None
    assert row["completed_at"] is not None
