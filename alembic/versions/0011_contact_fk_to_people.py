"""repoint school_visit_attendees.contact_id from legacy contacts to people

Revision ID: 0011_contact_fk_to_people
Revises: 0010_student_fks_to_people
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0011_contact_fk_to_people"
down_revision = "0010_student_fks_to_people"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0011_contact_fk_to_people.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    op.execute("""
        ALTER TABLE school_visit_attendees
            DROP CONSTRAINT school_visit_attendees_contact_id_fkey;
        ALTER TABLE school_visit_attendees
            ADD CONSTRAINT school_visit_attendees_contact_id_fkey
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT;
    """)
