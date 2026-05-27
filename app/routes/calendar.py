from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from ..auth import require_user
from ..db import get_conn
from ..google_calendar import ReauthRequired, get_access_token, list_upcoming

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/upcoming")
async def upcoming_events(
    days: int = Query(default=7, ge=1, le=31),
    limit: int = Query(default=10, ge=1, le=50),
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    try:
        access_token = await get_access_token(conn, user["id"])
        return await list_upcoming(access_token, days=days, limit=limit)
    except ReauthRequired:
        return JSONResponse(
            status_code=401,
            content={
                "code": "reauth_required",
                "detail": "Google Calendar access expired",
            },
        )
