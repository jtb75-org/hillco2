"""agreements.variables JSONB

PR-Tail step 3: per-agreement variable overrides. Auto-fill defaults
come from engagement / family / student / consultant context at render
time; this JSONB stores the operator's explicit fillins and overrides.

Effective render context is: defaults (computed each request) merged
with this dict (operator wins). Defaults to '{}' so existing
agreements continue to render with auto-fills only.

Revision ID: 0018_agreement_vars
Revises: 0017_agreement_body
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0018_agreement_vars"
down_revision = "0017_agreement_body"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE agreements
            ADD COLUMN variables JSONB NOT NULL DEFAULT '{}'::jsonb;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE agreements DROP COLUMN IF EXISTS variables;")
