"""POST /api/families/{id}/parents and .../students now accept an
optional `person_id` to link an existing people row instead of creating
a fresh one. Coverage:

  * link an existing guardian to a second family (split-household case)
  * link a kind='other' person as a guardian (e.g., a contact who turned
    out to be a parent — UX flow when the operator finds them in the
    typeahead)
  * 400 when the linked person is a student (can't be their own guardian)
  * 409 when the same person is already linked to this family
  * 422 when neither person_id nor name is provided
  * student-side mirror: link existing student to a second family,
    400 on kind mismatch, 409 on dup
"""
from uuid import uuid4


async def test_link_existing_guardian_to_second_family(authed_client):
    f1 = (await authed_client.post("/api/families", json={"household_name": f"A-{uuid4()}"})).json()["id"]
    f2 = (await authed_client.post("/api/families", json={"household_name": f"B-{uuid4()}"})).json()["id"]
    p = (await authed_client.post(f"/api/families/{f1}/parents", json={
        "first_name": "Pat", "last_name": "Parent", "role": "mom",
    })).json()
    pid = p["id"]

    r = await authed_client.post(f"/api/families/{f2}/parents", json={
        "person_id": pid, "role": "mom", "is_primary_contact": True,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["id"] == pid
    assert body["is_primary_contact"] is True

    f2_detail = await authed_client.get(f"/api/families/{f2}")
    parent_ids = [pp["id"] for pp in f2_detail.json()["parents"]]
    assert pid in parent_ids


async def test_link_kind_other_as_guardian(authed_client, db_pool):
    # Create a kind='other' person directly — represents a contact in the
    # address book who isn't yet attached to a family.
    async with db_pool.acquire() as conn:
        oid = await conn.fetchval(
            "INSERT INTO people (kind, first_name, last_name) VALUES ('other', 'Olive', 'Other') RETURNING id"
        )
    fid = (await authed_client.post("/api/families", json={"household_name": f"O-{uuid4()}"})).json()["id"]
    r = await authed_client.post(f"/api/families/{fid}/parents", json={
        "person_id": str(oid), "role": "guardian",
    })
    assert r.status_code == 201, r.text
    assert r.json()["id"] == str(oid)


async def test_link_student_as_guardian_rejected(authed_client, db_pool):
    async with db_pool.acquire() as conn:
        sid = await conn.fetchval(
            "INSERT INTO people (kind, first_name) VALUES ('student', 'Kid') RETURNING id"
        )
    fid = (await authed_client.post("/api/families", json={"household_name": f"S-{uuid4()}"})).json()["id"]
    r = await authed_client.post(f"/api/families/{fid}/parents", json={
        "person_id": str(sid), "role": "other",
    })
    assert r.status_code == 400


async def test_double_link_guardian_rejected(authed_client):
    fid = (await authed_client.post("/api/families", json={"household_name": f"D-{uuid4()}"})).json()["id"]
    p = (await authed_client.post(f"/api/families/{fid}/parents", json={
        "first_name": "Dup", "last_name": "Parent",
    })).json()
    r = await authed_client.post(f"/api/families/{fid}/parents", json={
        "person_id": p["id"], "role": "other",
    })
    assert r.status_code == 409


async def test_neither_person_id_nor_name_rejected(authed_client):
    fid = (await authed_client.post("/api/families", json={"household_name": f"N-{uuid4()}"})).json()["id"]
    r = await authed_client.post(f"/api/families/{fid}/parents", json={"role": "other"})
    assert r.status_code == 422


# ---- Students -----------------------------------------------------------

async def test_link_existing_student_to_second_family(authed_client):
    f1 = (await authed_client.post("/api/families", json={"household_name": f"SA-{uuid4()}"})).json()["id"]
    f2 = (await authed_client.post("/api/families", json={"household_name": f"SB-{uuid4()}"})).json()["id"]
    s = (await authed_client.post(f"/api/families/{f1}/students", json={
        "first_name": "Sam", "last_name": "Kid", "current_grade": "5th",
    })).json()
    sid = s["id"]

    r = await authed_client.post(f"/api/families/{f2}/students", json={"person_id": sid})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["id"] == sid
    # Grade stays from the original record (the linker can't overwrite).
    assert body["current_grade"] == "5th"


async def test_link_guardian_as_student_rejected(authed_client, db_pool):
    async with db_pool.acquire() as conn:
        gid = await conn.fetchval(
            "INSERT INTO people (kind, first_name) VALUES ('guardian', 'Guard') RETURNING id"
        )
    fid = (await authed_client.post("/api/families", json={"household_name": f"X-{uuid4()}"})).json()["id"]
    r = await authed_client.post(f"/api/families/{fid}/students", json={"person_id": str(gid)})
    assert r.status_code == 400


async def test_double_link_student_rejected(authed_client):
    fid = (await authed_client.post("/api/families", json={"household_name": f"DS-{uuid4()}"})).json()["id"]
    s = (await authed_client.post(
        f"/api/families/{fid}/students",
        json={"first_name": "Sam", "last_name": "Kid"},
    )).json()
    r = await authed_client.post(f"/api/families/{fid}/students", json={"person_id": s["id"]})
    assert r.status_code == 409


async def test_student_neither_person_id_nor_name_rejected(authed_client):
    fid = (await authed_client.post("/api/families", json={"household_name": f"NS-{uuid4()}"})).json()["id"]
    r = await authed_client.post(f"/api/families/{fid}/students", json={})
    assert r.status_code == 422
