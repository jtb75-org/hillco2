"""drop intakes.decision_makers

The decision-makers JSONB column captured a free-text list of people
with signing authority during a discovery meeting. In practice it
duplicated the family_guardians relationship and the dual UI display
(Decision-makers vs Family Guardians) was confusing. The intake page
now relies on family_guardians + the per-intake guardians selection
exclusively; family guardians cover the "who can sign" question.

This is a no-data-loss migration in the hillco2 environment (test
data only), but the downgrade re-creates the column with the same
shape so a forced rollback doesn't lose schema parity.

Revision ID: 0014_drop_decision_makers
Revises: 0013_requirements_extend
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0014_drop_decision_makers"
down_revision = "0013_requirements_extend"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE intakes DROP COLUMN IF EXISTS decision_makers;")


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE intakes
            ADD COLUMN decision_makers JSONB NOT NULL DEFAULT '[]'::jsonb;
        """
    )
