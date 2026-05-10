"""learning_supports table — 504 plans + IEPs

Revision ID: 0006_learning_supports
Revises: 0005_agreements
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0006_learning_supports"
down_revision = "0005_agreements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0006_learning_supports.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    op.execute("""
        DROP TABLE learning_supports;
        DROP TYPE learning_support_status;
        DROP TYPE learning_support_type;
    """)
