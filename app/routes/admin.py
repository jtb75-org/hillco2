import os
import re
from datetime import datetime
from typing import Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from ..auth import require_admin, require_user
from ..db import get_conn
from ..migrations import db_alembic_revision, image_alembic_head

# Loose RFC-5322-shaped email check. Picks up obvious typos (no @,
# trailing space) without pulling in the email-validator package just
# for one form. The SPA's <input type="email"> covers the rest.
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_VALID_ROLES = ("consultant", "assistant", "admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---- Response models -------------------------------------------------------

class AdminUser(BaseModel):
    id: UUID
    email: str
    name: str
    role: str
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime


class CreateUserRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    name: str = Field(min_length=1, max_length=200)
    role: Literal["consultant", "assistant", "admin"]

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v: str) -> str:
        v = v.strip()
        if not _EMAIL_RE.match(v):
            raise ValueError("must be a valid email address")
        return v

    @field_validator("name")
    @classmethod
    def _name_strip(cls, v: str) -> str:
        return v.strip()


class AuditLogEntry(BaseModel):
    id: int
    ts: datetime
    user_id: UUID | None
    user_email: str | None
    user_name: str | None
    table_name: str
    row_id: UUID | None
    action: str


class AuditLogPage(BaseModel):
    items: list[AuditLogEntry]
    total: int
    limit: int
    offset: int


class AuditLogDetail(AuditLogEntry):
    # Snapshot of the row before the change (NULL on INSERT) and after
    # (NULL on DELETE). Each is the raw `to_jsonb(row)` the trigger
    # captured, so columns map 1:1 to the underlying table.
    before_json: dict | None
    after_json: dict | None


class AboutInfo(BaseModel):
    build_commit: str
    api_title: str
    counts: dict[str, int]
    db_revision: str | None
    image_head_revision: str | None
    migration_in_sync: bool


# ---- Routes ----------------------------------------------------------------

_ADMIN_USER_SELECT = """
    SELECT
      p.id, p.email,
      TRIM(BOTH ' ' FROM
        COALESCE(p.first_name, '') ||
        CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
             THEN ' ' || p.last_name ELSE '' END
      )                                       AS name,
      a.app_role                              AS role,
      (a.status = 'active')                   AS is_active,
      a.last_login_at,
      p.created_at
    FROM auth a
    JOIN people p ON p.id = a.person_id
"""


@router.get("/users", response_model=list[AdminUser])
async def list_users(
    include_inactive: bool = False,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """All users (auth-provisioned people), sorted by active first then
    name. Anyone authenticated can read this for now.

    Deactivation soft-deletes the underlying people row, so by default
    those rows are filtered out. Admins can pass `include_inactive=true`
    to see deactivated accounts (so they can re-activate them)."""
    where = "" if include_inactive else "WHERE p.deleted_at IS NULL"
    rows = await conn.fetch(
        _ADMIN_USER_SELECT
        + f" {where} ORDER BY (a.status='active') DESC, p.last_name NULLS LAST, p.first_name"
    )
    return [dict(r) for r in rows]


@router.post("/users", response_model=AdminUser, status_code=201)
async def create_user(
    body: CreateUserRequest,
    _user=Depends(require_admin),
    conn=Depends(get_conn),
):
    """Pre-authorize a new user. Creates a person + auth row + a Google
    auth_identity keyed on the email. The user's first successful
    Google sign-in finds the identity and flips last_login_at."""
    email = body.email.lower()

    # Reject if any active auth_identity already maps the same Google
    # email to a person — that's the duplicate condition that used to
    # be enforced by users.email UNIQUE.
    if await conn.fetchval(
        """
        SELECT 1 FROM auth_identities
        WHERE provider = 'google' AND provider_subject = $1
        """,
        email,
    ):
        raise HTTPException(
            status_code=409,
            detail="A user with that email already exists.",
        )

    first, _, last = body.name.partition(" ")
    last = last.strip() or None
    person_id = await conn.fetchval(
        """
        INSERT INTO people (kind, first_name, last_name, email)
        VALUES ('other', $1, $2, $3)
        RETURNING id
        """,
        first or email, last, email,
    )
    try:
        await conn.execute(
            """
            INSERT INTO auth (person_id, status, app_role)
            VALUES ($1, 'active', $2)
            """,
            person_id, body.role,
        )
        await conn.execute(
            """
            INSERT INTO auth_identities (person_id, provider, provider_subject)
            VALUES ($1, 'google', $2)
            """,
            person_id, email,
        )
    except asyncpg.UniqueViolationError as e:
        # Race against another concurrent create with the same email.
        raise HTTPException(
            status_code=409,
            detail="A user with that email already exists.",
        ) from e

    row = await conn.fetchrow(_ADMIN_USER_SELECT + " WHERE p.id = $1", person_id)
    return dict(row)


@router.delete("/users/{user_id}", response_model=AdminUser)
async def deactivate_user(
    user_id: UUID,
    user=Depends(require_admin),
    conn=Depends(get_conn),
):
    """Soft-delete: flip auth.status to 'suspended' so the user can no
    longer sign in, and stamp people.deleted_at so they drop out of
    the address book. audit_log entries stay valid (still FK to
    people.id). Refuses to deactivate the caller's own account."""
    if user and user["id"] == user_id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    updated = await conn.fetchval(
        """
        UPDATE auth SET status = 'suspended' WHERE person_id = $1
        RETURNING person_id
        """,
        user_id,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found.")
    await conn.execute(
        "UPDATE people SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        user_id,
    )
    row = await conn.fetchrow(_ADMIN_USER_SELECT + " WHERE p.id = $1", user_id)
    return dict(row)


@router.post("/users/{user_id}/reactivate", response_model=AdminUser)
async def reactivate_user(
    user_id: UUID,
    _user=Depends(require_admin),
    conn=Depends(get_conn),
):
    """Reverse of deactivate_user. Idempotent: reactivating an already-
    active user just refreshes timestamps and returns the row."""
    updated = await conn.fetchval(
        """
        UPDATE auth SET status = 'active' WHERE person_id = $1
        RETURNING person_id
        """,
        user_id,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found.")
    await conn.execute(
        "UPDATE people SET deleted_at = NULL WHERE id = $1",
        user_id,
    )
    row = await conn.fetchrow(_ADMIN_USER_SELECT + " WHERE p.id = $1", user_id)
    return dict(row)


@router.get("/audit-log", response_model=AuditLogPage)
async def list_audit_log(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Recent audit_log entries, newest first. Offset-paginated;
    fine for the homelab scale (a few thousand rows). If we hit the
    wall, switch to keyset on audit_log.id."""
    total = await conn.fetchval("SELECT COUNT(*) FROM audit_log")
    rows = await conn.fetch(
        """
        SELECT al.id, al.ts, al.user_id,
               p.email AS user_email,
               TRIM(BOTH ' ' FROM
                 COALESCE(p.first_name, '') ||
                 CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                      THEN ' ' || p.last_name ELSE '' END
               ) AS user_name,
               al.table_name, al.row_id, al.action
        FROM audit_log al
        LEFT JOIN people p ON p.id = al.user_id
        ORDER BY al.id DESC
        LIMIT $1 OFFSET $2
        """,
        limit, offset,
    )
    return {
        "items": [dict(r) for r in rows],
        "total": total or 0,
        "limit": limit,
        "offset": offset,
    }


@router.get("/audit-log/{audit_id}", response_model=AuditLogDetail)
async def get_audit_log_entry(
    audit_id: int,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Single audit_log row with the captured before/after JSONB.
    Drives the per-entry detail drawer on the audit-log page."""
    row = await conn.fetchrow(
        """
        SELECT al.id, al.ts, al.user_id,
               p.email AS user_email,
               TRIM(BOTH ' ' FROM
                 COALESCE(p.first_name, '') ||
                 CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                      THEN ' ' || p.last_name ELSE '' END
               ) AS user_name,
               al.table_name, al.row_id, al.action,
               al.before_json, al.after_json
        FROM audit_log al
        LEFT JOIN people p ON p.id = al.user_id
        WHERE al.id = $1
        """,
        audit_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Audit entry not found")
    # asyncpg returns JSONB columns as strings; parse before returning so
    # the Pydantic dict type holds. (FastAPI's json encoder would re-
    # stringify anyway.)
    import json as _json
    out = dict(row)
    if isinstance(out.get("before_json"), str):
        out["before_json"] = _json.loads(out["before_json"])
    if isinstance(out.get("after_json"), str):
        out["after_json"] = _json.loads(out["after_json"])
    return out


@router.get("/about", response_model=AboutInfo)
async def about(_user=Depends(require_user), conn=Depends(get_conn)):
    """Build/runtime metadata for the about/settings tab. Counts give a
    quick sanity check on whether the app sees the data it should."""
    counts_row = await conn.fetchrow(
        """
        SELECT
          (SELECT COUNT(*) FROM auth)                AS users,
          (SELECT COUNT(*) FROM families
             WHERE deleted_at IS NULL)               AS families,
          (SELECT COUNT(*) FROM people
             WHERE kind = 'student' AND deleted_at IS NULL) AS students,
          (SELECT COUNT(*) FROM engagements
             WHERE deleted_at IS NULL)               AS engagements,
          (SELECT COUNT(*) FROM schools
             WHERE deleted_at IS NULL)               AS schools,
          (SELECT COUNT(*) FROM service_items
             WHERE deleted_at IS NULL)               AS service_items,
          (SELECT COUNT(*) FROM audit_log)           AS audit_log_entries
        """
    )
    db_rev = await db_alembic_revision(conn)
    img_head = image_alembic_head()
    return {
        "build_commit": os.environ.get("BUILD_COMMIT", "dev"),
        "api_title": "HillCo2 API",
        "counts": dict(counts_row) if counts_row else {},
        "db_revision": db_rev,
        "image_head_revision": img_head,
        "migration_in_sync": (
            db_rev is not None and img_head is not None and db_rev == img_head
        ),
    }
