"""fold users into people + auth + auth_identities

Revision ID: 0012_auth_into_people
Revises: 0011_contact_fk_to_people
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0012_auth_into_people"
down_revision = "0011_contact_fk_to_people"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0012_auth_into_people.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    """Rolling back this migration is genuinely hard — every user_id FK
    has to be repointed back at users(id), and the auth tables hold
    invite-flow state that doesn't fit on the legacy users row.
    Treat as forward-only; restore from a backup if a rollback is
    required."""
    raise NotImplementedError(
        "0012 is forward-only; restore from a backup taken before upgrade.",
    )
