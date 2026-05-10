"""student_details per-flag notes columns

Adds free-text columns beside the existing has_* flags so the
At-A-Glance section on the student detail page can capture brief
descriptions per diagnosis. `diagnosis_other` already serves the
"Other" flag; `needs_goals` is unchanged.

Revision ID: 0002_student_flag_notes
Revises: 0001_baseline
Create Date: 2026-05-10
"""
from alembic import op

revision: str = "0002_student_flag_notes"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


_COLS = (
    "learning_disability_notes",
    "intellectual_disability_notes",
    "health_impairment_notes",
    "emotional_disturbance_notes",
)


def upgrade() -> None:
    for col in _COLS:
        op.execute(
            f"ALTER TABLE student_details ADD COLUMN {col} text"
        )


def downgrade() -> None:
    for col in _COLS:
        op.execute(
            f"ALTER TABLE student_details DROP COLUMN IF EXISTS {col}"
        )
