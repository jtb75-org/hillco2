"""intakes.completed_at — mark intakes as done

Single nullable timestamp column on `intakes`. NULL = the intake is
still being worked on (default for new rows); a non-NULL timestamp
records when the consultant marked it complete. Simpler than a
multi-state status enum and gives us the completion time for free.

Revision ID: 0007_intake_completed_at
Revises: 0006_intakes
Create Date: 2026-05-14
"""
from alembic import op

revision: str = "0007_intake_completed_at"
down_revision = "0006_intakes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE intakes ADD COLUMN completed_at TIMESTAMPTZ;"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE intakes DROP COLUMN IF EXISTS completed_at;")
