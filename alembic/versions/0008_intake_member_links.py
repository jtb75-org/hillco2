"""intake_guardians + intake_students — per-intake member selection

An intake is a curated subset of a family: a meeting might focus on
one of two students or only include some of the guardians. Two M2M
tables hold the selection.

Schema:
- intake_guardians(intake_id, person_id) primary key on both. FK on
  intakes(id) ON DELETE CASCADE; FK on people(id) ON DELETE CASCADE.
- intake_students(intake_id, person_id) same shape.

Backfill: existing intakes get every current family member auto-
linked so they don't render as suddenly empty. New intakes start
empty and the consultant picks who's on the meeting.

Revision ID: 0008_intake_member_links
Revises: 0007_intake_completed_at
Create Date: 2026-05-14
"""
from alembic import op

revision: str = "0008_intake_member_links"
down_revision = "0007_intake_completed_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE intake_guardians (
            intake_id   UUID NOT NULL REFERENCES intakes(id) ON DELETE CASCADE,
            person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (intake_id, person_id)
        );
        """
    )
    op.execute(
        """
        CREATE INDEX intake_guardians_person_idx ON intake_guardians(person_id);
        """
    )
    op.execute(
        """
        CREATE TABLE intake_students (
            intake_id   UUID NOT NULL REFERENCES intakes(id) ON DELETE CASCADE,
            person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (intake_id, person_id)
        );
        """
    )
    op.execute(
        """
        CREATE INDEX intake_students_person_idx ON intake_students(person_id);
        """
    )

    # Backfill: every live intake picks up its family's current
    # guardians + students. This preserves the implicit behavior the
    # SPA was rendering before (intake displayed the whole family
    # roster). New intakes start empty.
    op.execute(
        """
        INSERT INTO intake_guardians (intake_id, person_id)
        SELECT i.id, fg.person_id
        FROM intakes i
        JOIN family_guardians fg ON fg.family_id = i.family_id
        WHERE i.deleted_at IS NULL
        ON CONFLICT DO NOTHING;
        """
    )
    op.execute(
        """
        INSERT INTO intake_students (intake_id, person_id)
        SELECT i.id, fs.person_id
        FROM intakes i
        JOIN family_students fs ON fs.family_id = i.family_id
        JOIN people p ON p.id = fs.person_id
                     AND p.kind = 'student'
                     AND p.deleted_at IS NULL
        WHERE i.deleted_at IS NULL
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS intake_students;")
    op.execute("DROP TABLE IF EXISTS intake_guardians;")
