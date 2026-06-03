"""Seed the 'custom' engagement type.

Adds a third engagement_type alongside 'assessment' and 'full_placement'.
Custom has no service_item_engagement_types memberships — consultants
populate activities by hand after conversion when neither Assessment
nor Full placement is the right shape.

Revision ID: 0023_seed_custom_engagement_type
Revises: 0022_google_oauth_tokens
Create Date: 2026-06-03
"""
from alembic import op

revision: str = "0023_seed_custom_engagement_type"
down_revision = "0022_google_oauth_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO engagement_types (code, label, sort_order, description) VALUES
            ('custom', 'Custom', 300,
             'Consultant-curated mix of activities. Convert into a Custom engagement when neither Assessment nor Full placement fits the family''s scope.')
        ON CONFLICT (code) DO NOTHING;
        """
    )


def downgrade() -> None:
    # Refuses if any engagement currently has type='custom' (FK is
    # RESTRICT). That's the right behavior — don't silently destroy
    # active engagement references on a rollback.
    op.execute("DELETE FROM engagement_types WHERE code = 'custom';")
