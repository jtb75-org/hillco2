from datetime import date, timedelta

from fastapi import APIRouter, Depends

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard")
async def dashboard(user=Depends(require_user), conn=Depends(get_conn)):
    """Single roll-up endpoint for the SPA's home page. Mirrors what
    hillco-portal's /home rendered: my-stats, my open followups,
    outstanding invoices, recent notes, and a compact audit feed.

    Limits are intentional — this is meant to be a fast first paint, not
    paginated tables. The SPA fetches the full lists from each domain's
    own endpoint when the user navigates."""
    today = date.today()

    stats = await conn.fetchrow(
        """
        SELECT
          (SELECT COUNT(*) FROM followups
             WHERE assignee_id = $1 AND status = 'open')                                   AS my_open_followups,
          (SELECT COUNT(*) FROM followups
             WHERE assignee_id = $1 AND status = 'open' AND due_date < $2)                 AS my_overdue_followups,
          (SELECT COALESCE(SUM(total - COALESCE(paid_amount, 0)), 0)
             FROM invoices
             WHERE deleted_at IS NULL AND status IN ('sent','overdue'))                    AS outstanding_total,
          (SELECT COUNT(*) FROM invoices
             WHERE deleted_at IS NULL AND status = 'sent' AND due_date < $2)               AS overdue_invoice_count,
          (SELECT COUNT(*) FROM engagements
             WHERE deleted_at IS NULL AND status IN ('in_progress','on_hold'))             AS active_engagements,
          (SELECT COALESCE(SUM(uninvoiced_total), 0)
             FROM engagement_financial_summary)                                            AS uninvoiced_total
        """,
        user["id"], today,
    )

    my_followups = await conn.fetch(
        """
        SELECT f.id, f.title, f.due_date, f.engagement_id,
               fam.id AS family_id, fam.household_name
        FROM followups f
        JOIN engagements e ON e.id = f.engagement_id AND e.deleted_at IS NULL
        JOIN families fam ON fam.id = e.family_id AND fam.deleted_at IS NULL
        WHERE f.status = 'open' AND f.assignee_id = $1
        ORDER BY f.due_date ASC, f.id
        LIMIT 10
        """,
        user["id"],
    )

    outstanding_invoices = await conn.fetch(
        """
        SELECT i.id, i.invoice_number, i.total, i.due_date, i.status,
               i.engagement_id,
               f.id AS family_id, f.household_name
        FROM invoices i
        JOIN engagements e ON e.id = i.engagement_id
        JOIN families f ON f.id = e.family_id
        WHERE i.deleted_at IS NULL AND i.status IN ('sent','overdue')
        ORDER BY i.due_date ASC NULLS LAST, i.id
        LIMIT 10
        """
    )

    recent_notes = await conn.fetch(
        """
        SELECT n.id, n.kind, n.occurred_on, n.title, n.created_at,
               n.engagement_id,
               f.id AS family_id, f.household_name,
               u.name AS created_by_name
        FROM notes n
        JOIN engagements e ON e.id = n.engagement_id AND e.deleted_at IS NULL
        JOIN families f ON f.id = e.family_id AND f.deleted_at IS NULL
        LEFT JOIN users u ON u.id = n.created_by
        ORDER BY n.created_at DESC
        LIMIT 8
        """
    )

    audit = await conn.fetch(
        """
        SELECT al.ts, al.table_name, al.action, u.email AS user_email
        FROM audit_log al
        LEFT JOIN users u ON u.id = al.user_id
        ORDER BY al.id DESC
        LIMIT 8
        """
    )

    return {
        "today": today.isoformat(),
        "week_out": (today + timedelta(days=7)).isoformat(),
        "stats": dict(stats) if stats else None,
        "my_followups": [dict(r) for r in my_followups],
        "outstanding_invoices": [dict(r) for r in outstanding_invoices],
        "recent_notes": [dict(r) for r in recent_notes],
        "audit": [dict(r) for r in audit],
    }
