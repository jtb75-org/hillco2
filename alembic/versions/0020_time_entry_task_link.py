"""time_entries.engagement_task_id

Lets a time entry be tagged to a specific engagement task instead of
only sitting at the engagement level. The Activities card's per-row
kebab gains a Log time option that pre-sets this column; the
freeform Log time button on the Time Entries card continues to
leave it NULL.

ON DELETE SET NULL so deleting a task strands its time entries at
engagement level rather than blowing them away — that's the right
default since the hours were actually worked even if the task
row was a mistake.

Revision ID: 0020_time_entry_task_link
Revises: 0019_org_settings
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0020_time_entry_task_link"
down_revision = "0019_org_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE time_entries
            ADD COLUMN engagement_task_id UUID
                REFERENCES engagement_tasks(id) ON DELETE SET NULL;
        """
    )
    op.execute(
        """
        CREATE INDEX time_entries_engagement_task_idx
            ON time_entries (engagement_task_id)
            WHERE engagement_task_id IS NOT NULL;
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS time_entries_engagement_task_idx;"
    )
    op.execute(
        "ALTER TABLE time_entries DROP COLUMN IF EXISTS engagement_task_id;"
    )
