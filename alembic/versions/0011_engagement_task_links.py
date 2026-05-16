"""school_visits + school_recommendations link to their orchestrating task

After 0010 (engagement_tasks.activity_kind), school_visit and
school_recommendation kinds are activity-shaped but their structured
data still lives in their own tables. Add a sparse FK from each to the
orchestrating engagement_tasks row, and partial-unique it so each
visit/recommendation maps to at most one task (and vice versa) —
matching Joe's signed-off 1:1 model.

Existing visits + recommendations without a task stay valid:
engagement_task_id starts NULL. The new atomic-create paths backfill
it on insert; the legacy POST endpoints could be amended later to
opt-in.

Revision ID: 0011_engagement_task_links
Revises: 0010_engagement_activity_kind
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0011_engagement_task_links"
down_revision = "0010_engagement_activity_kind"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE school_visits
            ADD COLUMN engagement_task_id UUID
                REFERENCES engagement_tasks(id) ON DELETE SET NULL;
        """
    )
    op.execute(
        """
        ALTER TABLE school_recommendations
            ADD COLUMN engagement_task_id UUID
                REFERENCES engagement_tasks(id) ON DELETE SET NULL;
        """
    )
    # Partial unique indexes lock in 1:1 between a task and its
    # visit/recommendation. NULL is allowed (legacy/no-task rows).
    op.execute(
        """
        CREATE UNIQUE INDEX school_visits_engagement_task_unique
            ON school_visits (engagement_task_id)
            WHERE engagement_task_id IS NOT NULL;
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX school_recommendations_engagement_task_unique
            ON school_recommendations (engagement_task_id)
            WHERE engagement_task_id IS NOT NULL;
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS school_recommendations_engagement_task_unique;"
    )
    op.execute("DROP INDEX IF EXISTS school_visits_engagement_task_unique;")
    op.execute(
        "ALTER TABLE school_recommendations DROP COLUMN IF EXISTS engagement_task_id;"
    )
    op.execute("ALTER TABLE school_visits DROP COLUMN IF EXISTS engagement_task_id;")
