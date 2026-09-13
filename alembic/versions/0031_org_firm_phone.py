"""add firm_phone to org_settings

Gives the firm one place to set a phone number. consultant_phone in contracts
falls back to it when the lead consultant's own phone is unset (mirroring how
consultant_address already falls back to the firm address).

Revision ID: 0031_org_firm_phone
Revises: 0030_medrel_consultant_addr
Create Date: 2026-09-13
"""
from alembic import op

revision: str = "0031_org_firm_phone"
down_revision = "0030_medrel_consultant_addr"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE org_settings ADD COLUMN firm_phone text")


def downgrade() -> None:
    op.execute("ALTER TABLE org_settings DROP COLUMN IF EXISTS firm_phone")
