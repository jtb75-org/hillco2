"""activity_kind: add 'intake_summary'

Adds a new value to the activity_kind ENUM so engagement_tasks (and
their service_item catalog defaults) can be tagged as an
intake-summary read-out. The body component renders a kind-specific
view of the upstream intake data (guardian roster, current school,
diagnostic flags, family goals) — see 0022 for the catalog section
column and backfill.

Split from 0022 because Postgres requires ALTER TYPE ADD VALUE to
commit before the new label is usable in DML; alembic wraps each
migration in a single transaction.

Revision ID: 0021_intake_summary_enum
Revises: 0020_time_entry_task_link
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0021_intake_summary_enum"
down_revision = "0020_time_entry_task_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE activity_kind ADD VALUE IF NOT EXISTS 'intake_summary';")


def downgrade() -> None:
    # Postgres can't remove individual enum values without rebuilding
    # the type. Leaving the value in place on downgrade is harmless —
    # rows referencing it are removed/reset by 0022's downgrade.
    pass
