"""Drop the deprecated catalog_phases.scope column.

Phase C of the engagement-types refactor. Engagement-type membership
now lives entirely on `service_item_engagement_types`. The
`catalog_phases.scope` enum column has been unused by both backend
filtering (since 0003) and the SPA (since the catalog page redesign in
PR B). Drop it for good — along with the `catalog_scope` ENUM type,
which has no remaining references.

Downgrade is best-effort: it can recreate the column and the ENUM, but
not the original per-row values. The downgrade backfills `scope` from
the engagement-type memberships using the same convention as the
0003 backfill (items belonging to `assessment` → assessment-scope
phase; otherwise placement). That round-trips a fresh seed but won't
recover a custom layout someone built with the new flat model.

Revision ID: 0005_drop_catalog_phases_scope
Revises: 0004_unify_phase_sort_order
Create Date: 2026-05-14
"""
from alembic import op

revision: str = "0005_drop_catalog_phases_scope"
down_revision = "0004_unify_phase_sort_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The column has a NOT NULL constraint; dropping the column also
    # drops the constraint and the index referencing it (none exist
    # post-baseline, but ALTER TABLE … DROP COLUMN handles them).
    op.execute("ALTER TABLE catalog_phases DROP COLUMN IF EXISTS scope;")
    # ENUM is now unreferenced — clean it up.
    op.execute("DROP TYPE IF EXISTS catalog_scope;")


def downgrade() -> None:
    # Recreate the enum + column. Defaults are nullable until the
    # backfill runs, then we enforce NOT NULL like the baseline.
    op.execute(
        "CREATE TYPE catalog_scope AS ENUM ('assessment', 'placement');"
    )
    op.execute(
        "ALTER TABLE catalog_phases ADD COLUMN scope catalog_scope;"
    )
    # Backfill: a phase is "assessment" if any of its items belong to
    # the assessment engagement type; otherwise treat it as placement.
    op.execute(
        """
        UPDATE catalog_phases cp
           SET scope = CASE
             WHEN EXISTS (
               SELECT 1 FROM service_items si
                 JOIN service_item_engagement_types siet ON siet.service_item_id = si.id
                 JOIN engagement_types et ON et.id = siet.engagement_type_id
                WHERE si.phase_id = cp.id
                  AND et.code = 'assessment'
                  AND et.deleted_at IS NULL
             ) THEN 'assessment'::catalog_scope
             ELSE 'placement'::catalog_scope
           END;
        """
    )
    op.execute("ALTER TABLE catalog_phases ALTER COLUMN scope SET NOT NULL;")
