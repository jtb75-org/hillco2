from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import asyncpg
import httpx

from .config import settings

TOKEN_URL = "https://oauth2.googleapis.com/token"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"


class ReauthRequired(Exception):
    """Google credentials are missing, expired, or revoked."""


def _expires_at(expires_in: int | None) -> datetime | None:
    if expires_in is None:
        return None
    return datetime.now(UTC) + timedelta(seconds=expires_in)


async def get_access_token(conn: asyncpg.Connection, person_id: UUID) -> str:
    row = await conn.fetchrow(
        """
        SELECT refresh_token, access_token, access_token_expires_at
        FROM google_oauth_tokens
        WHERE person_id = $1
        """,
        person_id,
    )
    if row is None:
        raise ReauthRequired()

    expires_at = row["access_token_expires_at"]
    if (
        row["access_token"]
        and expires_at
        and expires_at > datetime.now(UTC) + timedelta(seconds=60)
    ):
        return row["access_token"]

    refresh_token = row["refresh_token"]
    if not refresh_token:
        raise ReauthRequired()

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            TOKEN_URL,
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
        )

    if response.status_code in {400, 401}:
        raise ReauthRequired()
    response.raise_for_status()
    payload = response.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise ReauthRequired()

    expires_at = _expires_at(payload.get("expires_in"))
    await conn.execute(
        """
        UPDATE google_oauth_tokens
        SET access_token = $2,
            access_token_expires_at = $3,
            scope = COALESCE($4, scope),
            updated_at = NOW()
        WHERE person_id = $1
        """,
        person_id,
        access_token,
        expires_at,
        payload.get("scope"),
    )
    return access_token


def _event_time(value: dict[str, Any]) -> str | None:
    return value.get("dateTime") or value.get("date")


async def list_upcoming(
    access_token: str,
    days: int = 7,
    limit: int = 10,
) -> list[dict[str, Any]]:
    now = datetime.now(UTC)
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            EVENTS_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "timeMin": now.isoformat().replace("+00:00", "Z"),
                "timeMax": (now + timedelta(days=days)).isoformat().replace("+00:00", "Z"),
                "maxResults": limit,
                "singleEvents": "true",
                "orderBy": "startTime",
            },
        )

    if response.status_code == 401:
        raise ReauthRequired()
    response.raise_for_status()

    events = []
    for item in response.json().get("items", []):
        start = item.get("start") or {}
        end = item.get("end") or {}
        events.append(
            {
                "id": item.get("id"),
                "summary": item.get("summary"),
                "start": _event_time(start),
                "end": _event_time(end),
                "all_day": "date" in start,
                "location": item.get("location"),
                "html_link": item.get("htmlLink"),
            }
        )
    return events
