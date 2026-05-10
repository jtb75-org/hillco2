"""dedicated billing_attention_to column on people

Revision ID: 0009_people_billing_attention
Revises: 0008_people_spine
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0009_people_billing_attention"
down_revision = "0008_people_spine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0009_people_billing_attention.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    """Push values back into notes for any row that has billing_attention_to
    set, then drop the column. Best-effort — if a downgrade ever happens
    after real per-person notes were added, this overwrites them."""
    op.execute("""
        UPDATE people
           SET notes = billing_attention_to
         WHERE billing_attention_to IS NOT NULL AND notes IS NULL;
        ALTER TABLE people DROP COLUMN billing_attention_to;
    """)
