"""Unify catalog_phases.sort_order across scopes so a flat catalog list
orders sanely.

The seed left assessment phases at sort_order 100..700 and placement
phases at 100..400. With Phase B of the engagement-types refactor the
SPA renders a single flat list (no scope tabs), so ORDER BY sort_order
needs to be globally meaningful. Bump placement sort_orders by 1000 to
preserve the existing visual order (assessment first, then placement)
while making sort_order unique enough to sort on its own. Pure data
fixup — no schema change.

Revision ID: 0004_unify_phase_sort_order
Revises: 0003_engagement_types
Create Date: 2026-05-14
"""
from alembic import op

revision: str = "0004_unify_phase_sort_order"
down_revision = "0003_engagement_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE catalog_phases
           SET sort_order = sort_order + 1000
         WHERE scope = 'placement';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE catalog_phases
           SET sort_order = sort_order - 1000
         WHERE scope = 'placement';
        """
    )
