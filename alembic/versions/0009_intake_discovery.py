"""intake discovery model — structured prompts + outcome + convert

Replaces the single-blob intake notes with a structured Discovery layout.
Adds family-context fields, per-student discovery + candidacy, an
outcome enum that drives closure (no more standalone "mark complete"),
and a snapshot column on engagements that captures the intake's
discovery context at convert time.

Also introduces a `families.lifecycle_stage` enum so declined intakes
don't leave families looking like active leads.

Schema:
- intakes: 13 new columns (referral_source, desired_outcome,
  constraints JSONB, consent_granted, family_context_notes,
  decision_makers JSONB, outcome enum, outcome_at, disposition_reason,
  next_step_owner enum, next_step_due, blocker, converted_at).
- intake_students: 8 new columns (working, not_working, history,
  school_fit, supports_tried, candidate, recommended_engagement_type
  → engagement_types(code), mentions JSONB).
- engagements: intake_snapshot JSONB.
- families: lifecycle_stage TEXT CHECK enum, default 'lead'.

The existing `intakes.notes` column is **kept as-is** — it stays as the
bottom catch-all "Intake notes" rich-text bucket. The new
`family_context_notes` is a distinct, purpose-named column.

`completed_at` stays for backward compat but the API owns its
transition alongside `outcome` + `outcome_at` in a single transaction —
no Postgres trigger.

Backfill:
- intakes with `completed_at IS NOT NULL`:
    - has engagement → outcome='converting', outcome_at=completed_at,
      converted_at=completed_at.
    - no engagement → outcome='no_response', outcome_at=completed_at.
- families:
    - any non-deleted engagement → lifecycle_stage='client'.
    - otherwise → lifecycle_stage='lead'.

Revision ID: 0009_intake_discovery
Revises: 0008_intake_member_links
Create Date: 2026-05-16
"""
from alembic import op

revision: str = "0009_intake_discovery"
down_revision = "0008_intake_member_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- intakes: new columns -----------------------------------------
    op.execute(
        """
        ALTER TABLE intakes
            ADD COLUMN referral_source TEXT
                CHECK (referral_source IN (
                    'word_of_mouth','pediatrician','therapist',
                    'school','search','returning','other'
                )),
            ADD COLUMN desired_outcome TEXT,
            ADD COLUMN constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN consent_granted BOOLEAN,
            ADD COLUMN family_context_notes TEXT,
            ADD COLUMN decision_makers JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN outcome TEXT
                CHECK (outcome IN (
                    'converting','nurture','declined_by_family',
                    'declined_by_hillco','no_response','duplicate'
                )),
            ADD COLUMN outcome_at TIMESTAMPTZ,
            ADD COLUMN disposition_reason TEXT,
            ADD COLUMN next_step_owner TEXT
                CHECK (next_step_owner IN (
                    'consultant','family','awaiting_records'
                )),
            ADD COLUMN next_step_due DATE,
            ADD COLUMN blocker TEXT,
            ADD COLUMN converted_at TIMESTAMPTZ;
        """
    )

    # ---- intake_students: discovery + candidacy -----------------------
    # recommended_engagement_type FKs engagement_types(code). ON DELETE
    # SET NULL so soft-deleting a type from the catalog doesn't break
    # the candidacy row — the API surfaces the invalid state instead.
    op.execute(
        """
        ALTER TABLE intake_students
            ADD COLUMN working        TEXT,
            ADD COLUMN not_working    TEXT,
            ADD COLUMN history        TEXT,
            ADD COLUMN school_fit     TEXT,
            ADD COLUMN supports_tried TEXT,
            ADD COLUMN candidate      BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN recommended_engagement_type TEXT
                REFERENCES engagement_types(code) ON DELETE SET NULL,
            ADD COLUMN mentions       JSONB NOT NULL DEFAULT '[]'::jsonb;
        """
    )

    # ---- engagements: intake snapshot ---------------------------------
    op.execute(
        """
        ALTER TABLE engagements
            ADD COLUMN intake_snapshot JSONB;
        """
    )

    # ---- families: lifecycle stage ------------------------------------
    op.execute(
        """
        ALTER TABLE families
            ADD COLUMN lifecycle_stage TEXT NOT NULL DEFAULT 'lead'
                CHECK (lifecycle_stage IN (
                    'lead','prospect','client','archived'
                ));
        """
    )

    # ---- backfill: intakes already in completed state -----------------
    # Two paths: completed_at-with-engagement → converting; otherwise
    # no_response. Stamps outcome_at + converted_at from completed_at so
    # the existing record reads consistently in the new model.
    op.execute(
        """
        UPDATE intakes i
        SET outcome = 'converting',
            outcome_at = i.completed_at,
            converted_at = i.completed_at
        WHERE i.completed_at IS NOT NULL
          AND i.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 FROM engagements e
              WHERE e.intake_id = i.id
                AND e.deleted_at IS NULL
          );
        """
    )
    op.execute(
        """
        UPDATE intakes i
        SET outcome = 'no_response',
            outcome_at = i.completed_at
        WHERE i.completed_at IS NOT NULL
          AND i.deleted_at IS NULL
          AND i.outcome IS NULL;
        """
    )

    # ---- backfill: families with any live engagement → client --------
    op.execute(
        """
        UPDATE families f
        SET lifecycle_stage = 'client'
        WHERE f.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 FROM engagements e
              WHERE e.family_id = f.id
                AND e.deleted_at IS NULL
          );
        """
    )

    # ---- helpful indexes ---------------------------------------------
    # Intake list will filter by outcome (open vs closed) + sort by
    # next_step_due for the follow-up queue.
    op.execute(
        """
        CREATE INDEX intakes_outcome_idx
            ON intakes (outcome)
            WHERE deleted_at IS NULL;
        """
    )
    op.execute(
        """
        CREATE INDEX intakes_next_step_due_idx
            ON intakes (next_step_due)
            WHERE deleted_at IS NULL AND next_step_due IS NOT NULL;
        """
    )
    # Families list will filter by lifecycle_stage.
    op.execute(
        """
        CREATE INDEX families_lifecycle_stage_idx
            ON families (lifecycle_stage)
            WHERE deleted_at IS NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS families_lifecycle_stage_idx;")
    op.execute("DROP INDEX IF EXISTS intakes_next_step_due_idx;")
    op.execute("DROP INDEX IF EXISTS intakes_outcome_idx;")

    op.execute("ALTER TABLE families DROP COLUMN IF EXISTS lifecycle_stage;")
    op.execute("ALTER TABLE engagements DROP COLUMN IF EXISTS intake_snapshot;")

    op.execute(
        """
        ALTER TABLE intake_students
            DROP COLUMN IF EXISTS mentions,
            DROP COLUMN IF EXISTS recommended_engagement_type,
            DROP COLUMN IF EXISTS candidate,
            DROP COLUMN IF EXISTS supports_tried,
            DROP COLUMN IF EXISTS school_fit,
            DROP COLUMN IF EXISTS history,
            DROP COLUMN IF EXISTS not_working,
            DROP COLUMN IF EXISTS working;
        """
    )

    op.execute(
        """
        ALTER TABLE intakes
            DROP COLUMN IF EXISTS converted_at,
            DROP COLUMN IF EXISTS blocker,
            DROP COLUMN IF EXISTS next_step_due,
            DROP COLUMN IF EXISTS next_step_owner,
            DROP COLUMN IF EXISTS disposition_reason,
            DROP COLUMN IF EXISTS outcome_at,
            DROP COLUMN IF EXISTS outcome,
            DROP COLUMN IF EXISTS decision_makers,
            DROP COLUMN IF EXISTS family_context_notes,
            DROP COLUMN IF EXISTS consent_granted,
            DROP COLUMN IF EXISTS constraints,
            DROP COLUMN IF EXISTS desired_outcome,
            DROP COLUMN IF EXISTS referral_source;
        """
    )
