"""agreements table — services contracts + medical releases

Revision ID: 0005_agreements
Revises: 0004_family_billing_rollup
Create Date: 2026-05-10
"""
from pathlib import Path

from alembic import op

revision: str = "0005_agreements"
down_revision = "0004_family_billing_rollup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sql_path = Path(__file__).parent / "0005_agreements.sql"
    op.execute(sql_path.read_text())


def downgrade() -> None:
    """Restore engagements.package_fee from the most-recent active
    services_contract per engagement (best-effort — multi-step
    supersession history is lost), then drop the new tables/types."""
    op.execute("""
        ALTER TABLE engagements ADD COLUMN package_fee NUMERIC(12,2);
        UPDATE engagements e
           SET package_fee = a.amount
          FROM agreements a
         WHERE a.engagement_id = e.id
           AND a.type = 'services_contract'
           AND a.status = 'active';
        DROP TABLE agreements;
        DROP TABLE agreement_sequence;
        DROP FUNCTION next_contract_number();
        DROP TYPE agreement_status;
        DROP TYPE agreement_type;
    """)
