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
        # Lookup path post-0012: identity rows in auth_identities are the
        # source of truth for "who's allowed to sign in." For Google we
        # use the lowercase email as the subject (matches the legacy
        # email-keyed flow), so backfilled consultants resolve cleanly.
        identity = await conn.fetchrow(
            """
            SELECT ai.person_id, p.email
            FROM auth_identities ai
            JOIN people p ON p.id = ai.person_id AND p.deleted_at IS NULL
            WHERE ai.provider = 'google' AND ai.provider_subject = $1
            """,
            email,
        )

        if identity is None:
            # First time we see this email and they're in allowed_emails:
            # auto-create person + auth + identity, the same way the
            # legacy upsert-into-users path used to do.
            first, _, last = name.partition(" ")
            last = last.strip() or None
            person_id = await conn.fetchval(
                """
                INSERT INTO people (kind, first_name, last_name, email)
                VALUES ('other', $1, $2, $3)
                RETURNING id
                """,
                first or email,
                last,
                email,
            )
            await conn.execute(
                """
                INSERT INTO auth (person_id, status, app_role, last_login_at)
                VALUES ($1, 'active', 'consultant', NOW())
                """,
                person_id,
            )
            await conn.execute(
                """
                INSERT INTO auth_identities (person_id, provider, provider_subject)
                VALUES ($1, 'google', $2)
                """,
                person_id, email,
            )
        else:
            person_id = identity["person_id"]
            # Attribute updates to the user themselves. audit_trigger
            # picks up app.user_id from the transaction.
            await conn.execute(
                "SELECT set_config('app.user_id', $1, true)", str(person_id)
            )
            # Refresh display name from the OIDC userinfo, and stamp
            # last_login on auth.
            first, _, last = name.partition(" ")
            last = last.strip() or None
            await conn.execute(
                "UPDATE people SET first_name = $1, last_name = $2 WHERE id = $3",
                first or email, last, person_id,
            )
            await conn.execute(
                "UPDATE auth SET last_login_at = NOW() WHERE person_id = $1",
                person_id,
            )

        # Refetch the composed display name + email after any update above.
        row = await conn.fetchrow(
            """
            SELECT
              p.id, p.email,
              TRIM(BOTH ' ' FROM
                COALESCE(p.first_name, '') ||
                CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                     THEN ' ' || p.last_name ELSE '' END
              ) AS name
            FROM people p
            WHERE p.id = $1
            """,
            person_id,
        )

    request.session["user_id"] = str(row["id"])
    request.session["user_email"] = row["email"]
    request.session["user_name"] = row["name"]
    return RedirectResponse(POST_LOGIN_REDIRECT, status_code=303)


@router.post("/api/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "logged_out"}
