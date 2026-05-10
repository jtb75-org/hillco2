"""move billing data from family to parent

Revision ID: 0007_billing_on_parent
Revises: 0006_learning_supports
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0007_billing_on_parent"
down_revision = "0006_learning_supports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0007_billing_on_parent.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    """Restore the family-level columns; copy each billing parent's
    data back. Best-effort — if the role surface evolved past what
    0004's billing_* could hold (multiple billing contacts can't fit),
    the downgrade picks one arbitrarily."""
    op.execute("""
        ALTER TABLE families
            ADD COLUMN billing_name         TEXT,
            ADD COLUMN billing_email        CITEXT,
            ADD COLUMN billing_attention_to TEXT,
            ADD COLUMN billing_address      TEXT;

        UPDATE families f
           SET billing_name         = p.name,
               billing_email        = p.email,
               billing_attention_to = p.billing_attention_to,
               billing_address      = p.billing_address
          FROM parents p
         WHERE p.family_id = f.id AND p.is_billing_contact;

        DROP INDEX parents_one_billing_per_family;
        ALTER TABLE parents
            DROP COLUMN billing_attention_to,
            DROP COLUMN billing_address,
            DROP COLUMN is_billing_contact;
    """)
