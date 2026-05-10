"""create the `people` spine + family junctions + detail tables

Revision ID: 0008_people_spine
Revises: 0007_billing_on_parent
Create Date: 2026-05-10

PR-1 of the four-PR people-spine restructure. Expand step only:
the new tables get created and backfilled from the legacy
parents / students / contacts (school) tables. Routes are unchanged
in this migration; PR-2 (0009) switches them over.
"""
from pathlib import Path

from alembic import op

revision: str = "0008_people_spine"
down_revision = "0007_billing_on_parent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0008_people_spine.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    """Drop the new tables. Legacy parents / students / contacts data
    is untouched, so a downgrade is a clean unwind — nothing in the
    legacy tables references the new spine."""
    op.execute("""
        DROP TABLE school_worker_details;
        DROP TABLE student_details;
        DROP TABLE family_students;
        DROP TABLE family_guardians;
        DROP TABLE people;
        DROP TYPE person_kind;
    """)
