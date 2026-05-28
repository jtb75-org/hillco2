from datetime import UTC, datetime, timedelta

import httpx
import respx

from app.google_calendar import EVENTS_URL, TOKEN_URL


async def _insert_token(
    db_pool,
    person_id,
    *,
    access_token="access-token",
    refresh_token="refresh-token",
    expires_delta=timedelta(minutes=10),
):
    async with db_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO google_oauth_tokens (
              person_id, refresh_token, access_token, access_token_expires_at, scope
            )
            VALUES ($1, $2, $3, $4, $5)
            """,
            person_id,
            refresh_token,
            access_token,
            datetime.now(UTC) + expires_delta,
            "https://www.googleapis.com/auth/calendar.readonly",
        )


def _events_response():
    return {
        "items": [
            {
                "id": "evt-1",
                "summary": "Consultation",
                "start": {"dateTime": "2026-05-28T15:00:00-04:00"},
                "end": {"dateTime": "2026-05-28T16:00:00-04:00"},
                "location": "Office",
                "htmlLink": "https://calendar.google.com/event?eid=evt-1",
            },
            {
                "id": "evt-2",
                "summary": "Hold",
                "start": {"date": "2026-05-29"},
                "end": {"date": "2026-05-30"},
                "htmlLink": "https://calendar.google.com/event?eid=evt-2",
            },
        ]
    }


async def test_calendar_upcoming_uses_fresh_access_token(authed_client, db_pool, test_user):
    await _insert_token(db_pool, test_user["id"], access_token="fresh-token")

    async with respx.mock(assert_all_mocked=False) as router:
        events_route = router.get(EVENTS_URL).mock(
            return_value=httpx.Response(200, json=_events_response())
        )

        r = await authed_client.get("/api/calendar/upcoming", params={"days": 3, "limit": 2})

    assert r.status_code == 200
    assert r.json() == [
        {
            "id": "evt-1",
            "summary": "Consultation",
            "start": "2026-05-28T15:00:00-04:00",
            "end": "2026-05-28T16:00:00-04:00",
            "all_day": False,
            "location": "Office",
            "html_link": "https://calendar.google.com/event?eid=evt-1",
        },
        {
            "id": "evt-2",
            "summary": "Hold",
            "start": "2026-05-29",
            "end": "2026-05-30",
            "all_day": True,
            "location": None,
            "html_link": "https://calendar.google.com/event?eid=evt-2",
        },
    ]
    assert events_route.called
    request = events_route.calls[0].request
    assert request.headers["authorization"] == "Bearer fresh-token"
    assert request.url.params["maxResults"] == "2"
    assert request.url.params["singleEvents"] == "true"
    assert request.url.params["orderBy"] == "startTime"


async def test_calendar_upcoming_refreshes_expired_access_token(
    authed_client,
    db_pool,
    test_user,
):
    await _insert_token(
        db_pool,
        test_user["id"],
        access_token="expired-token",
        refresh_token="refresh-token",
        expires_delta=timedelta(minutes=-5),
    )
    async with respx.mock(assert_all_mocked=False) as router:
        refresh_route = router.post(TOKEN_URL).mock(
            return_value=httpx.Response(
                200,
                json={
                    "access_token": "refreshed-token",
                    "expires_in": 3600,
                    "scope": "https://www.googleapis.com/auth/calendar.readonly",
                },
            )
        )
        events_route = router.get(EVENTS_URL).mock(
            return_value=httpx.Response(200, json={"items": []})
        )

        r = await authed_client.get("/api/calendar/upcoming")

    assert r.status_code == 200
    assert r.json() == []
    assert refresh_route.called
    assert events_route.calls[0].request.headers["authorization"] == "Bearer refreshed-token"
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT access_token, access_token_expires_at
            FROM google_oauth_tokens
            WHERE person_id = $1
            """,
            test_user["id"],
        )
    assert row["access_token"] == "refreshed-token"
    assert row["access_token_expires_at"] > datetime.now(UTC) + timedelta(minutes=50)


async def test_calendar_upcoming_revoked_refresh_token_returns_reauth(
    authed_client,
    db_pool,
    test_user,
):
    await _insert_token(
        db_pool,
        test_user["id"],
        access_token="expired-token",
        refresh_token="revoked-token",
        expires_delta=timedelta(minutes=-5),
    )

    async with respx.mock(assert_all_mocked=False) as router:
        router.post(TOKEN_URL).mock(
            return_value=httpx.Response(400, json={"error": "invalid_grant"})
        )

        r = await authed_client.get("/api/calendar/upcoming")

    assert r.status_code == 401
    assert r.json() == {
        "code": "reauth_required",
        "detail": "Google Calendar access expired",
    }


async def test_calendar_upcoming_google_401_returns_reauth(
    authed_client,
    db_pool,
    test_user,
):
    await _insert_token(db_pool, test_user["id"], access_token="stale-token")

    async with respx.mock(assert_all_mocked=False) as router:
        router.get(EVENTS_URL).mock(
            return_value=httpx.Response(
                401,
                json={
                    "error": {
                        "code": 401,
                        "message": "Invalid Credentials",
                        "status": "UNAUTHENTICATED",
                    }
                },
            )
        )

        r = await authed_client.get("/api/calendar/upcoming")

    assert r.status_code == 401
    assert r.json() == {
        "code": "reauth_required",
        "detail": "Google Calendar access expired",
    }


async def test_calendar_upcoming_google_403_returns_typed_access_denied(
    authed_client,
    db_pool,
    test_user,
):
    await _insert_token(db_pool, test_user["id"], access_token="fresh-token")

    async with respx.mock(assert_all_mocked=False) as router:
        router.get(EVENTS_URL).mock(
            return_value=httpx.Response(
                403,
                json={
                    "error": {
                        "code": 403,
                        "message": "Google Calendar API has not been used in project.",
                        "status": "PERMISSION_DENIED",
                    }
                },
            )
        )

        r = await authed_client.get("/api/calendar/upcoming")

    assert r.status_code == 503
    assert r.json() == {
        "code": "calendar_access_denied",
        "detail": "Google Calendar API has not been used in project.",
    }


async def test_calendar_upcoming_missing_token_row_returns_reauth(authed_client):
    r = await authed_client.get("/api/calendar/upcoming")

    assert r.status_code == 401
    assert r.json() == {
        "code": "reauth_required",
        "detail": "Google Calendar access expired",
    }
