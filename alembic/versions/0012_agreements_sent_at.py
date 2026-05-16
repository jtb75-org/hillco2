"""agreements.sent_at

Adds a nullable sent_at timestamp on agreements. The 3-state
operator-facing contract lifecycle (drafted → sent → signed) is
mapped onto the existing status enum without changing it:

- drafted  : status='draft'  AND sent_at IS NULL
- sent     : status='draft'  AND sent_at IS NOT NULL
- signed   : status='active' (signed_at + document_id also set)

POST /api/agreements/{id}/mark-sent stamps sent_at via COALESCE
(idempotent — first send wins); the UI can offer an explicit re-send
that overwrites via PATCH. Existing rows leave sent_at NULL on
backfill; for already-active legacy agreements the UI surfaces a
"we don't know when this was sent" hint.

Revision ID: 0012_agreements_sent_at
Revises: 0011_engagement_task_links
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0012_agreements_sent_at"
down_revision = "0011_engagement_task_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE agreements
            ADD COLUMN sent_at TIMESTAMPTZ;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE agreements DROP COLUMN IF EXISTS sent_at;")
