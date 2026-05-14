"""engagement_types table + service_item_engagement_types M2M

Moves engagement-type membership from a hardcoded Python dict
(ENGAGEMENT_TYPE_SCOPES) and a per-phase `scope` enum into data:

- New `engagement_types` table with code/label/sort_order/description.
  Seeded with the existing two values (`assessment`, `full_placement`).
- New `service_item_engagement_types` M2M linking each service item to
  the engagement types it should seed into. Backfilled from
  `catalog_phases.scope` — items in assessment-scope phases get the
  `assessment` membership; items in placement-scope phases get the
  `full_placement` membership (placement work only ever flowed into
  full-placement engagements).
- `engagements.engagement_type` switches from a Postgres ENUM to a
  TEXT column with a FK to `engagement_types(code)`. Same string
  values stay valid; new types added via the SPA's catalog page can
  be used on new engagements without a schema change.
- `catalog_phases.scope` stays for now (deprecated) so the existing
  /api/catalog/phases?scope= path keeps working until the SPA
  redesigns the catalog page.

Revision ID: 0003_engagement_types
Revises: 0002_student_flag_notes
Create Date: 2026-05-14
"""
from alembic import op

revision: str = "0003_engagement_types"
down_revision = "0002_student_flag_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- engagement_types ------------------------------------------------
    op.execute(
        """
        CREATE TABLE engagement_types (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code         TEXT UNIQUE NOT NULL,
            label        TEXT NOT NULL,
            description  TEXT,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at   TIMESTAMPTZ
        );
        """
    )
    op.execute(
        """
        CREATE INDEX engagement_types_active_idx
            ON engagement_types (id) WHERE (deleted_at IS NULL);
        """
    )
    op.execute(
        """
        CREATE TRIGGER engagement_types_audit
            AFTER INSERT OR UPDATE OR DELETE ON engagement_types
            FOR EACH ROW EXECUTE FUNCTION audit_trigger();
        """
    )
    op.execute(
        """
        CREATE TRIGGER engagement_types_set_updated_at
            BEFORE UPDATE ON engagement_types
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """
    )

    # Seed the two pre-existing types. Labels are display-only; codes
    # stay stable so existing engagements (and the SPA's hardcoded
    # picker for now) keep working.
    op.execute(
        """
        INSERT INTO engagement_types (code, label, sort_order, description) VALUES
            ('assessment', 'Assessment', 100,
             'Assessment-only engagement — intake through recommendation, no school placement.'),
            ('full_placement', 'Full placement', 200,
             'Assessment plus school placement work — campus visits, interview prep, submissions, selection.');
        """
    )

    # ---- service_item_engagement_types (M2M) ----------------------------
    op.execute(
        """
        CREATE TABLE service_item_engagement_types (
            service_item_id     UUID NOT NULL
                REFERENCES service_items(id) ON DELETE CASCADE,
            engagement_type_id  UUID NOT NULL
                REFERENCES engagement_types(id) ON DELETE CASCADE,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (service_item_id, engagement_type_id)
        );
        """
    )
    op.execute(
        """
        CREATE INDEX service_item_engagement_types_type_idx
            ON service_item_engagement_types (engagement_type_id);
        """
    )

    # Backfill from existing catalog_phases.scope.
    #
    # Old model: full_placement engagements pulled items from BOTH
    # assessment-scope and placement-scope phases (full = assessment +
    # placement). Assessment engagements pulled only assessment-scope.
    #
    # New model: each item lists the engagement types it belongs to.
    # Preserve old behavior by:
    #   - assessment-phase items → membership in BOTH assessment AND
    #     full_placement (so they still appear in either kind of
    #     engagement).
    #   - placement-phase items → membership in full_placement only
    #     (assessment engagements never saw them).
    op.execute(
        """
        INSERT INTO service_item_engagement_types (service_item_id, engagement_type_id)
        SELECT si.id, et.id
          FROM service_items si
          JOIN catalog_phases cp
            ON cp.id = si.phase_id
           AND cp.deleted_at IS NULL
          CROSS JOIN engagement_types et
         WHERE si.deleted_at IS NULL
           AND cp.scope::text = 'assessment'
           AND et.code IN ('assessment', 'full_placement')
        ON CONFLICT DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO service_item_engagement_types (service_item_id, engagement_type_id)
        SELECT si.id, et.id
          FROM service_items si
          JOIN catalog_phases cp
            ON cp.id = si.phase_id
           AND cp.deleted_at IS NULL
          JOIN engagement_types et
            ON et.code = 'full_placement'
         WHERE si.deleted_at IS NULL
           AND cp.scope::text = 'placement'
        ON CONFLICT DO NOTHING;
        """
    )

    # ---- engagements.engagement_type: enum -> text + FK -----------------
    # Drop the ENUM-typed column constraint so new codes from the
    # engagement_types table can be used. Existing values ('assessment',
    # 'full_placement') are preserved as the cast-to-text value.
    op.execute(
        """
        ALTER TABLE engagements
            ALTER COLUMN engagement_type TYPE TEXT
            USING engagement_type::TEXT;
        """
    )
    op.execute("ALTER TABLE engagements ALTER COLUMN engagement_type DROP DEFAULT;")
    op.execute("ALTER TABLE engagements ALTER COLUMN engagement_type SET DEFAULT 'assessment';")

    # Now enforce that values must exist in engagement_types(code). The
    # FK uses ON DELETE RESTRICT so a soft-deleted type doesn't break
    # historical engagements, and a hard delete would refuse to drop a
    # type that's still in use.
    op.execute(
        """
        ALTER TABLE engagements
            ADD CONSTRAINT engagements_engagement_type_fk
            FOREIGN KEY (engagement_type)
            REFERENCES engagement_types(code)
            ON UPDATE CASCADE
            ON DELETE RESTRICT;
        """
    )

    # The ENUM type is now unreferenced — drop it.
    op.execute("DROP TYPE engagement_type;")


def downgrade() -> None:
    # Recreate the enum, point engagements.engagement_type back at it,
    # then drop the new tables. The M2M is purely additive — no data
    # loss when reversed.
    op.execute(
        "ALTER TABLE engagements DROP CONSTRAINT IF EXISTS engagements_engagement_type_fk;"
    )
    op.execute(
        """
        CREATE TYPE engagement_type AS ENUM ('assessment', 'full_placement');
        """
    )
    op.execute("ALTER TABLE engagements ALTER COLUMN engagement_type DROP DEFAULT;")
    op.execute(
        """
        ALTER TABLE engagements
            ALTER COLUMN engagement_type TYPE engagement_type
            USING engagement_type::engagement_type;
        """
    )
    op.execute(
        "ALTER TABLE engagements ALTER COLUMN engagement_type SET DEFAULT 'assessment'::engagement_type;"
    )

    op.execute("DROP TABLE service_item_engagement_types;")
    op.execute("DROP TRIGGER IF EXISTS engagement_types_audit ON engagement_types;")
    op.execute("DROP TRIGGER IF EXISTS engagement_types_set_updated_at ON engagement_types;")
    op.execute("DROP TABLE engagement_types;")
