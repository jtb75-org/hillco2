"""engagement_requirements gains status + notes

Adds operator-facing state tracking to engagement_requirements. The
existing `value` column stays as the human-readable description of
the requirement ("504 plan PDF", "Speech-therapy eval"); the new
`notes` column is for follow-up context ("Asked mom 5/8", "Pulled
from family folder"); the new `status` column tracks where each
requirement is in the discovery loop.

Status values (CHECK constraint, not a PG enum — easier to extend):
  - needed     : known to be needed, not yet asked for
  - requested  : asked the family but haven't received it
  - received   : in hand
  - waived     : we're not going to chase it

Backfill: any existing row with a non-empty `value` is treated as
'received' (the row only existed because the consultant captured
the artifact). Rows with NULL/empty value default to 'needed'.

Revision ID: 0013_engagement_requirements_extend
Revises: 0012_agreements_sent_at
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0013_engagement_requirements_extend"
down_revision = "0012_agreements_sent_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE engagement_requirements
            ADD COLUMN status TEXT NOT NULL DEFAULT 'needed'
                CHECK (status IN ('needed', 'requested', 'received', 'waived')),
            ADD COLUMN notes TEXT;
        """
    )
    op.execute(
        """
        UPDATE engagement_requirements
        SET status = 'received'
        WHERE value IS NOT NULL AND value <> '';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE engagement_requirements
            DROP COLUMN IF EXISTS notes,
            DROP COLUMN IF EXISTS status;
        """
    )
