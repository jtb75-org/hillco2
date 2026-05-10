"""drop the four legacy tables (parents, students, contacts, users)

Revision ID: 0013_drop_legacy_tables
Revises: 0012_auth_into_people
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0013_drop_legacy_tables"
down_revision = "0012_auth_into_people"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0013_drop_legacy_tables.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    """Recreating the four legacy tables would require re-applying their
    full DDL plus reversing all the FK repointings from 0010/0011/0012.
    Treat as forward-only; if a rollback is ever needed, restore from
    a backup taken before upgrade."""
    raise NotImplementedError(
        "0013 is forward-only; restore from a backup taken before upgrade.",
    )
