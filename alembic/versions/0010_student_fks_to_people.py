"""repoint student FKs from legacy students to people

Revision ID: 0010_student_fks_to_people
Revises: 0009_people_billing_attention
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0010_student_fks_to_people"
down_revision = "0009_people_billing_attention"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0010_student_fks_to_people.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    op.execute("""
        ALTER TABLE learning_supports DROP CONSTRAINT learning_supports_student_id_fkey;
        ALTER TABLE learning_supports
            ADD CONSTRAINT learning_supports_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

        ALTER TABLE engagements DROP CONSTRAINT engagements_student_id_fkey;
        ALTER TABLE engagements
            ADD CONSTRAINT engagements_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
            ADD CONSTRAINT engagements_student_family_consistent
                FOREIGN KEY (student_id, family_id)
                REFERENCES students(id, family_id);
    """)
