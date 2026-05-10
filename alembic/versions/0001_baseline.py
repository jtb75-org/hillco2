"""baseline schema

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply the literal baseline schema.

    The SQL lives in 0001_baseline.sql alongside this file rather than
    inline in a Python triple-quoted string, so editors keep SQL syntax
    highlighting and the file is diffable against the existing
    schema.sql while both exist (during the additive PR #2 phase).
    """
    sql_path = Path(__file__).parent / "0001_baseline.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    """Drop everything.

    The baseline owns the full public schema; downgrading past it is
    intentionally destructive. Used by the test fixture (clean room
    each run) and reachable via `alembic downgrade base` in dev. The
    cluster's bootstrap Job only ever runs `upgrade head`."""
    op.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
