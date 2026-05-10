import os
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .db import db
from .routes import auth as auth_routes
from .routes import contacts as contacts_routes
from .routes import dashboard as dashboard_routes
from .routes import engagement_tasks as engagement_tasks_routes
from .routes import engagements as engagements_routes
from .routes import expenses as expenses_routes
from .routes import families as families_routes
from .routes import followups as followups_routes
from .routes import health as health_routes
from .routes import learning_profiles as learning_profiles_routes
from .routes import me as me_routes
from .routes import notes as notes_routes
from .routes import recommendations as recommendations_routes
from .routes import school_visits as school_visits_routes
from .routes import schools as schools_routes
from .routes import students as students_routes
from .routes import time_entries as time_entries_routes


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.connect()
    try:
        yield
    finally:
        await db.disconnect()


BUILD_COMMIT = os.environ.get("BUILD_COMMIT", "dev")

app = FastAPI(title="HillCo2 API", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    same_site="lax",
    https_only=settings.session_https_only,
    max_age=settings.session_max_age_seconds,
)

# CORS only when explicitly configured (e.g. dev pointing at the Vite dev
# server). In production the SPA and API share an origin via path-based
# ingress so no CORS preflight is involved.
if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def add_build_commit(request: Request, call_next):
    request.state.build_commit = BUILD_COMMIT
    return await call_next(request)


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def csrf_origin_check(request: Request, call_next):
    """Reject state-changing requests whose Origin/Referer doesn't match
    this app's host. Defense against CSRF that doesn't require token plumbing
    in the SPA. Same-origin browser fetches include Origin automatically;
    cross-site forgeries either spoof a different host or omit the header.

    /auth/callback is exempt because it's a top-level redirect from Google.
    Cross-origin requests from configured CORS origins are also accepted —
    CORSMiddleware has already validated the Origin against the allowlist.
    """
    if request.method in SAFE_METHODS:
        return await call_next(request)
    if request.url.path.startswith("/auth/callback"):
        return await call_next(request)

    expected_host = request.url.netloc
    origin = request.headers.get("origin")
    referer = request.headers.get("referer")
    cors_origins = set(settings.cors_origin_list)

    def host_of(value: str) -> str:
        try:
            return urlparse(value).netloc
        except Exception:
            return ""

    if origin:
        if origin in cors_origins:
            return await call_next(request)
        if host_of(origin) != expected_host:
            return JSONResponse(
                {"detail": "CSRF check failed: origin mismatch"}, status_code=403
            )
    elif referer:
        if host_of(referer) != expected_host:
            return JSONResponse(
                {"detail": "CSRF check failed: referer mismatch"}, status_code=403
            )
    else:
        return JSONResponse(
            {"detail": "CSRF check failed: missing origin/referer"}, status_code=403
        )

    return await call_next(request)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault(
        "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


@app.exception_handler(RequestValidationError)
async def auth_aware_validation_error(request: Request, exc: RequestValidationError):
    """Don't leak FastAPI's pydantic error shape to unauthenticated callers.

    A bare GET to a protected route would otherwise return a 422 that names
    the route, the path-param type, and the offending input — useful for an
    attacker mapping the routing topology before they have credentials.
    Authenticated users still get the normal 422 with details so debugging
    works.
    """
    if not request.session.get("user_id"):
        return JSONResponse(
            {"detail": "Authentication required"}, status_code=401
        )
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(exc.errors())},
    )


app.include_router(health_routes.router)
app.include_router(auth_routes.router)
app.include_router(me_routes.router)
app.include_router(families_routes.router)
app.include_router(students_routes.router)
app.include_router(schools_routes.router)
app.include_router(contacts_routes.router)
app.include_router(engagements_routes.router)
app.include_router(notes_routes.router)
app.include_router(followups_routes.router)
app.include_router(time_entries_routes.router)
app.include_router(expenses_routes.router)
app.include_router(school_visits_routes.router)
app.include_router(recommendations_routes.router)
app.include_router(engagement_tasks_routes.router)
app.include_router(learning_profiles_routes.router)
app.include_router(dashboard_routes.router)
