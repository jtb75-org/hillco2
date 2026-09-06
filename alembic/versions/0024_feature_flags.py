"""feature flags

A tiny key/enabled table for admin-toggleable UI switches. The catalog
of known flags (labels, descriptions, defaults) lives in Python
(app/routes/feature_flags.py); this table only stores overrides, so a
newly-added flag works from its default before anyone touches it.

Revision ID: 0024_feature_flags
Revises: 0023_seed_custom_engagement_type
Create Date: 2026-09-06
"""
from alembic import op

revision: str = "0024_feature_flags"
down_revision = "0023_seed_custom_engagement_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE feature_flags (
            key        text PRIMARY KEY,
            enabled    boolean NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS feature_flags")
