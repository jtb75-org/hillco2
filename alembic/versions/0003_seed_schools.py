"""seed schools from the hillco-portal snapshot

Migration 0003 inserts 34 school rows pulled from the legacy
hillco-portal database. The hillco-portal `schools` table has the
same 12 columns as hillco2 (id, name, location, school_type,
grade_range_low/high, website, fit_profile, notes, deleted_at,
created_at, updated_at), so no transforms are needed — the snapshot
INSERTs are passed through with `ON CONFLICT (id) DO NOTHING` for
idempotency.

The hillco-portal data also contains school_recommendations and
school_visits, but those FK to engagements which haven't been
migrated. They'll come in a follow-up if/when engagements move.

Revision ID: 0003_seed_schools
Revises: 0002_student_flag_notes
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op


revision: str = "0003_seed_schools"
down_revision = "0002_student_flag_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0003_seed_schools.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    # No-op: the migration only INSERTs reference data with ON CONFLICT
    # DO NOTHING. Pulling the rows back out would risk wiping schools
    # the operator has since edited or referenced from school_visits /
    # school_recommendations created post-seed.
    pass
