from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from ..auth import oauth
from ..config import settings
from ..db import request_conn

router = APIRouter()

# After successful login the browser ends up here; the SPA picks up the
# session cookie and renders. Configurable so dev (Vite at :5173) can
# redirect back to its own origin instead of the API host.
POST_LOGIN_REDIRECT = "/"


@router.get("/auth/login")
async def auth_login(request: Request):
    redirect_uri = str(request.url_for("auth_callback"))
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/auth/callback", name="auth_callback")
async def auth_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo")
    if not userinfo or not userinfo.get("email"):
        return RedirectResponse(f"{POST_LOGIN_REDIRECT}?login_error=no_userinfo", status_code=303)

    email = userinfo["email"].lower()
    if email not in settings.allowed_email_set:
        return RedirectResponse(f"{POST_LOGIN_REDIRECT}?login_error=not_allowed", status_code=303)

    name = userinfo.get("name") or email

    # Drop any pre-login state before opening the upsert transaction. authlib's
    # `authorize_access_token` calls `clear_state_data` internally before
    # returning, so the OIDC `_state_*` keys are already gone by here — clearing
    # again is safe. Doing it before the upsert means a transient DB error
    # can't leave stale session keys behind for the next request.
    request.session.clear()

    async with request_conn(None) as conn:
        # Attribute the upsert to the existing user when possible, so audit_log
        # rows for repeat logins aren't anonymous.
        existing_id = await conn.fetchval(
            "SELECT id FROM users WHERE email = $1", email
        )
        if existing_id is not None:
            await conn.execute(
                "SELECT set_config('app.user_id', $1, true)", str(existing_id)
            )

        row = await conn.fetchrow(
            """
            INSERT INTO users (email, name, role, last_login_at)
            VALUES ($1, $2, 'consultant', NOW())
            ON CONFLICT (email) DO UPDATE SET
                name = EXCLUDED.name,
                last_login_at = NOW()
            RETURNING id, email, name
            """,
            email,
            name,
        )

    request.session["user_id"] = str(row["id"])
    request.session["user_email"] = row["email"]
    request.session["user_name"] = row["name"]
    return RedirectResponse(POST_LOGIN_REDIRECT, status_code=303)


@router.post("/api/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "logged_out"}
