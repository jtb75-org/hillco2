"""engagement task activity_kind + structured_content

Activity kind is the workflow-shape discriminator on
engagement_tasks. Most tasks are kind='task'; specific catalog items
declare their own kind via service_items.default_activity_kind, which
is inherited at seed time. The kind drives UI shape:

- task                    → plain checklist row with notes
- document_review         → educational + medical doc lists
                            (structured_content.{educational_doc_ids, medical_doc_ids})
- best_environment        → curriculum / placement_size / social_emotional / extras
                            (rich-text strings on structured_content)
- feedback_meeting        → recommendations / admissions / follow_on
                            (rich-text strings)
- school_visit            → backed by a school_visits row via
                            engagement_task_id (added in 0011)
- school_recommendation   → backed by a school_recommendations row
                            (same)

Day-one backfill of service_items uses title-pattern matching to
upgrade the four canonical catalog items (document review, best
educational environment, campus visit, feedback meeting). Live
catalogs with non-canonical wording can be upgraded via the
catalog admin once it surfaces the field.

Revision ID: 0010_engagement_activity_kind
Revises: 0009_intake_discovery
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0010_engagement_activity_kind"
down_revision = "0009_intake_discovery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- 1. activity_kind enum type --------------------------------
    op.execute(
        """
        CREATE TYPE activity_kind AS ENUM (
            'task',
            'document_review',
            'best_environment',
            'feedback_meeting',
            'school_visit',
            'school_recommendation'
        );
        """
    )

    # ---- 2. engagement_tasks gains the new columns -----------------
    op.execute(
        """
        ALTER TABLE engagement_tasks
            ADD COLUMN activity_kind activity_kind NOT NULL DEFAULT 'task',
            ADD COLUMN structured_content JSONB NOT NULL DEFAULT '{}'::jsonb;
        """
    )

    # ---- 3. service_items gains default_activity_kind --------------
    op.execute(
        """
        ALTER TABLE service_items
            ADD COLUMN default_activity_kind activity_kind NOT NULL DEFAULT 'task';
        """
    )

    # ---- 4. backfill canonical catalog items by title --------------
    # Title-pattern matching. Idempotent — re-running just leaves
    # everything in its new kind.
    op.execute(
        """
        UPDATE service_items
        SET default_activity_kind = 'document_review'
        WHERE deleted_at IS NULL
          AND default_activity_kind = 'task'
          AND (
            LOWER(title) LIKE '%review of documents%'
            OR LOWER(title) LIKE '%document review%'
            OR LOWER(title) LIKE '%records review%'
          );
        """
    )
    op.execute(
        """
        UPDATE service_items
        SET default_activity_kind = 'best_environment'
        WHERE deleted_at IS NULL
          AND default_activity_kind = 'task'
          AND (
            LOWER(title) LIKE '%best educational environment%'
            OR LOWER(title) LIKE '%support needs profile%'
          );
        """
    )
    op.execute(
        """
        UPDATE service_items
        SET default_activity_kind = 'school_visit'
        WHERE deleted_at IS NULL
          AND default_activity_kind = 'task'
          AND (
            LOWER(title) LIKE '%campus visit%'
            OR LOWER(title) LIKE '%school visit%'
          );
        """
    )
    op.execute(
        """
        UPDATE service_items
        SET default_activity_kind = 'feedback_meeting'
        WHERE deleted_at IS NULL
          AND default_activity_kind = 'task'
          AND (
            LOWER(title) LIKE '%feedback & next steps%'
            OR LOWER(title) LIKE '%feedback meeting%'
            OR LOWER(title) LIKE '%feedback and next steps%'
          );
        """
    )

    # ---- 5. backfill existing engagement_tasks from their service ---
    # Tasks seeded from a now-upgraded catalog item inherit the new
    # kind. Tasks with no service_item_id (bespoke) stay as 'task'.
    op.execute(
        """
        UPDATE engagement_tasks t
        SET activity_kind = s.default_activity_kind
        FROM service_items s
        WHERE t.service_item_id = s.id
          AND s.default_activity_kind != 'task'
          AND t.activity_kind = 'task';
        """
    )

    # ---- 6. filtering index ----------------------------------------
    op.execute(
        """
        CREATE INDEX engagement_tasks_activity_kind_idx
            ON engagement_tasks (activity_kind);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS engagement_tasks_activity_kind_idx;")
    op.execute("ALTER TABLE service_items DROP COLUMN IF EXISTS default_activity_kind;")
    op.execute(
        """
        ALTER TABLE engagement_tasks
            DROP COLUMN IF EXISTS structured_content,
            DROP COLUMN IF EXISTS activity_kind;
        """
    )
    op.execute("DROP TYPE IF EXISTS activity_kind;")
