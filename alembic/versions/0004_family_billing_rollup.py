"""family billing rollup + primary-contact uniqueness

Revision ID: 0004_family_billing_rollup
Revises: 0003_drop_engagement_students
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0004_family_billing_rollup"
down_revision = "0003_drop_engagement_students"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0004_family_billing_rollup.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS parents_one_primary_per_family;
        ALTER TABLE families
            DROP COLUMN IF EXISTS billing_address,
            DROP COLUMN IF EXISTS billing_attention_to,
            DROP COLUMN IF EXISTS billing_email,
            DROP COLUMN IF EXISTS billing_name;
    """)
