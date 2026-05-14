"""intakes table + engagements.intake_id link

Captures the family-level intake meeting that precedes one or more
engagements. A family can have many intakes over time (e.g., returns
years later); each intake can spawn many engagements (e.g., a separate
engagement per child).

Schema:
- `intakes(id, family_id, intake_date, consultant_id, notes, …)` with
  audit + set_updated_at triggers and the standard `deleted_at`
  soft-delete column.
- `engagements.intake_id UUID REFERENCES intakes(id) ON DELETE SET
  NULL` so an engagement points back at the intake it grew out of.
  Optional — engagements can still be created without a paired intake
  (the existing /api/families/:id/engagements flow is unchanged).

Revision ID: 0006_intakes
Revises: 0005_drop_catalog_phases_scope
Create Date: 2026-05-14
"""
from alembic import op

revision: str = "0006_intakes"
down_revision = "0005_drop_catalog_phases_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE intakes (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            family_id      UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
            intake_date    DATE NOT NULL DEFAULT CURRENT_DATE,
            -- Consultant who conducted the intake. NULL allowed for legacy
            -- imports or imported-from-paper records.
            consultant_id  UUID REFERENCES people(id) ON DELETE SET NULL,
            notes          TEXT,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at     TIMESTAMPTZ
        );
        """
    )
    op.execute(
        """
        CREATE INDEX intakes_family_active_idx
            ON intakes (family_id)
            WHERE deleted_at IS NULL;
        """
    )
    op.execute(
        """
        CREATE TRIGGER intakes_audit
            AFTER INSERT OR UPDATE OR DELETE ON intakes
            FOR EACH ROW EXECUTE FUNCTION audit_trigger();
        """
    )
    op.execute(
        """
        CREATE TRIGGER intakes_set_updated_at
            BEFORE UPDATE ON intakes
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """
    )

    op.execute(
        """
        ALTER TABLE engagements
            ADD COLUMN intake_id UUID REFERENCES intakes(id) ON DELETE SET NULL;
        """
    )
    op.execute(
        """
        CREATE INDEX engagements_intake_idx
            ON engagements (intake_id)
            WHERE intake_id IS NOT NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS engagements_intake_idx;")
    op.execute("ALTER TABLE engagements DROP COLUMN IF EXISTS intake_id;")
    op.execute("DROP TRIGGER IF EXISTS intakes_audit ON intakes;")
    op.execute("DROP TRIGGER IF EXISTS intakes_set_updated_at ON intakes;")
    op.execute("DROP TABLE IF EXISTS intakes;")
