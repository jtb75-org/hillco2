"""service_items.intake_summary_section + backfill

Adds the section discriminator that determines which slice of the
intake summary an `activity_kind='intake_summary'` activity renders.
A single ENUM value (intake_summary) plus a section column keeps the
catalog-author UX as "pick kind, then pick section" instead of
exploding into four kinds.

Allowed sections (text + CHECK, not an ENUM, so adding a fifth slice
later is just a CHECK change):

  - contacts        — guardians, roles, addresses
  - current_school  — student current school + grade
  - diagnoses       — 504/IEP/learning/autism/etc. flags
  - goals           — family desired outcome + per-student goals

The four seeded Client Intake activities are upgraded by title match;
already-converted engagement_tasks linked to those service_items
inherit the new kind and a snapshot of the section into
structured_content.

Revision ID: 0022_intake_summary_section
Revises: 0021_intake_summary_enum
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0022_intake_summary_section"
down_revision = "0021_intake_summary_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- 1. add the column + CHECK ---------------------------------
    op.execute(
        """
        ALTER TABLE service_items
            ADD COLUMN intake_summary_section TEXT;
        """
    )
    op.execute(
        """
        ALTER TABLE service_items
            ADD CONSTRAINT service_items_intake_summary_section_chk
            CHECK (
                intake_summary_section IS NULL
                OR intake_summary_section IN (
                    'contacts',
                    'current_school',
                    'diagnoses',
                    'goals'
                )
            );
        """
    )
    # Section must be set iff kind = intake_summary. CHECK enforces
    # both directions so the catalog can't drift into an inconsistent
    # state via direct SQL.
    op.execute(
        """
        ALTER TABLE service_items
            ADD CONSTRAINT service_items_intake_summary_section_kind_chk
            CHECK (
                (default_activity_kind = 'intake_summary'
                 AND intake_summary_section IS NOT NULL)
                OR
                (default_activity_kind <> 'intake_summary'
                 AND intake_summary_section IS NULL)
            );
        """
    )

    # ---- 2. upgrade the seeded Client Intake activities -------------
    # Title-pattern matching is the same approach 0010 used for the
    # other kinds. Idempotent — re-running just keeps everything in
    # its new kind/section.
    #
    # We disable the kind+section CHECK only for the duration of the
    # UPDATE batch because the two columns get set in separate
    # statements; without that, the first UPDATE would briefly leave
    # us in the forbidden state (kind=intake_summary, section=NULL).
    op.execute(
        """
        ALTER TABLE service_items
            DROP CONSTRAINT service_items_intake_summary_section_kind_chk;
        """
    )
    op.execute(
        """
        UPDATE service_items
        SET default_activity_kind = 'intake_summary',
            intake_summary_section = 'contacts'
        WHERE deleted_at IS NULL
          AND default_activity_kind = 'task'
          AND LOWER(title) LIKE '%names and contact%';
        """
    )
    op.execute(
        """
        UPDATE service_items
        SET default_activity_kind = 'intake_summary',
            intake_summary_section = 'current_school'
        WHERE deleted_at IS NULL
          AND default_activity_kind = 'task'
          AND LOWER(title) LIKE '%current school%';
        """
    )
    op.execute(
        """
        UPDATE service_items
        SET default_activity_kind = 'intake_summary',
            intake_summary_section = 'diagnoses'
        WHERE deleted_at IS NULL
          AND default_activity_kind = 'task'
          AND (
            LOWER(title) LIKE '%background diagnoses%'
            OR LOWER(title) LIKE '%background diagnosis%'
          );
        """
    )
    op.execute(
        """
        UPDATE service_items
        SET default_activity_kind = 'intake_summary',
            intake_summary_section = 'goals'
        WHERE deleted_at IS NULL
          AND default_activity_kind = 'task'
          AND LOWER(title) LIKE '%needs and goals%';
        """
    )
    op.execute(
        """
        ALTER TABLE service_items
            ADD CONSTRAINT service_items_intake_summary_section_kind_chk
            CHECK (
                (default_activity_kind = 'intake_summary'
                 AND intake_summary_section IS NOT NULL)
                OR
                (default_activity_kind <> 'intake_summary'
                 AND intake_summary_section IS NULL)
            );
        """
    )

    # ---- 3. backfill existing engagement_tasks ----------------------
    # Tasks seeded from an upgraded catalog item inherit the new kind
    # AND get a snapshot of the section into structured_content so the
    # body component doesn't need to re-join service_items at render.
    op.execute(
        """
        UPDATE engagement_tasks t
        SET activity_kind = 'intake_summary',
            structured_content = jsonb_build_object('section', s.intake_summary_section)
        FROM service_items s
        WHERE t.service_item_id = s.id
          AND s.default_activity_kind = 'intake_summary'
          AND t.activity_kind = 'task';
        """
    )


def downgrade() -> None:
    # Reverse the engagement_task backfill first (kind first, then
    # blank the structured_content so the CHECK on service_items can
    # be applied cleanly when we revert it).
    op.execute(
        """
        UPDATE engagement_tasks
        SET activity_kind = 'task',
            structured_content = '{}'::jsonb
        WHERE activity_kind = 'intake_summary';
        """
    )
    op.execute(
        """
        ALTER TABLE service_items
            DROP CONSTRAINT IF EXISTS service_items_intake_summary_section_kind_chk;
        """
    )
    op.execute(
        """
        UPDATE service_items
        SET default_activity_kind = 'task',
            intake_summary_section = NULL
        WHERE default_activity_kind = 'intake_summary';
        """
    )
    op.execute(
        """
        ALTER TABLE service_items
            DROP CONSTRAINT IF EXISTS service_items_intake_summary_section_chk;
        """
    )
    op.execute(
        "ALTER TABLE service_items DROP COLUMN IF EXISTS intake_summary_section;"
    )
