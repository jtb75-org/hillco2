import os
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn
from ..migrations import db_alembic_revision, image_alembic_head

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


class AboutInfo(BaseModel):
    build_commit: str
    api_title: str
    counts: dict[str, int]
    db_revision: str | None
    image_head_revision: str | None
    migration_in_sync: bool


# ---- Routes ----------------------------------------------------------------

@router.get("/users", response_model=list[AdminUser])
async def list_users(_user=Depends(require_user), conn=Depends(get_conn)):
    """All users, sorted by name. Anyone authenticated can read this for
    now; if the role surface grows we'll gate this on an admin role."""
    rows = await conn.fetch(
        """
        SELECT id, email, name, role, is_active, last_login_at, created_at
        FROM users
        ORDER BY is_active DESC, name
        """
    )
    return [dict(r) for r in rows]


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
        SELECT al.id, al.ts, al.user_id, u.email AS user_email, u.name AS user_name,
               al.table_name, al.row_id, al.action
        FROM audit_log al
        LEFT JOIN users u ON u.id = al.user_id
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


@router.get("/about", response_model=AboutInfo)
async def about(_user=Depends(require_user), conn=Depends(get_conn)):
    """Build/runtime metadata for the about/settings tab. Counts give a
    quick sanity check on whether the app sees the data it should."""
    counts_row = await conn.fetchrow(
        """
        SELECT
          (SELECT COUNT(*) FROM users)               AS users,
          (SELECT COUNT(*) FROM families
             WHERE deleted_at IS NULL)               AS families,
          (SELECT COUNT(*) FROM students
             WHERE deleted_at IS NULL)               AS students,
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
