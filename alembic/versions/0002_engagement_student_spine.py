"""engagement-student spine flip

Revision ID: 0002_engagement_student_spine
Revises: 0001_baseline
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0002_engagement_student_spine"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0002_engagement_student_spine.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    """Reversing the spine flip after data has flowed under the new shape
    is genuinely hard — there's no way to recover an M:N world from a
    1:1 column without losing information. Tests recreate from base via
    DROP SCHEMA; treat this migration as forward-only in real life."""
    raise NotImplementedError(
        "0002 is forward-only; downgrade by restoring from a backup taken before upgrade."
    )
