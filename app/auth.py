from authlib.integrations.starlette_client import OAuth
from fastapi import Depends, HTTPException, Request, status

from .config import settings
from .db import get_conn

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": "openid email profile https://www.googleapis.com/auth/calendar.readonly"
    },
)


async def current_user(request: Request, conn=Depends(get_conn)):
    # The validated user row is populated by get_conn() before audit
    # attribution is set, so audit_log entries can never disagree with what
    # this function returns. Conn dependency is kept so get_conn runs first.
    return getattr(request.state, "current_user", None)


async def require_user(user=Depends(current_user)):
    """JSON-API equivalent of login_required_redirect — raises 401 on no
    session so the SPA can intercept and route the user to /auth/login."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user


async def require_admin(user=Depends(require_user)):
    """Gate for endpoints that only the admin role should reach. The
    SPA hides the corresponding UI for non-admins, but this layer
    blocks anyone who hits the endpoint directly (curl, intent-driven
    URL typing, etc.). Returns 403 with a clear message."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required.",
        )
    return user
