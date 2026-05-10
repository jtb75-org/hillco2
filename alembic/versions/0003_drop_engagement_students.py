"""drop engagement_students junction

Revision ID: 0003_drop_engagement_students
Revises: 0002_engagement_student_spine
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0003_drop_engagement_students"
down_revision = "0002_engagement_student_spine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0003_drop_engagement_students.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    """The junction held no information that wasn't in engagements.student_id
    after 0002, but recreating an empty M:N table is harmless if a rollback
    were ever needed for shape compatibility."""
    op.execute("""
        CREATE TABLE engagement_students (
            engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
            student_id    UUID NOT NULL REFERENCES students(id)    ON DELETE CASCADE,
            PRIMARY KEY (engagement_id, student_id)
        );
        INSERT INTO engagement_students (engagement_id, student_id)
            SELECT id, student_id FROM engagements WHERE student_id IS NOT NULL;
    """)
