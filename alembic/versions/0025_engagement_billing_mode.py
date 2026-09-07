"""engagement billing mode (fixed vs hourly)

Adds an explicit billing mode + fixed price to engagement types, snapshots
those onto engagements, and lets contract templates be tagged by mode so the
app can auto-pick a fixed-fee vs hourly services contract. Everything
defaults to 'hourly' so existing rows are unchanged. See
docs/plans/fixed-bid-billing-phase1.md.

Revision ID: 0025_engagement_billing_mode
Revises: 0024_feature_flags
Create Date: 2026-09-07
"""
from alembic import op

revision: str = "0025_engagement_billing_mode"
down_revision = "0024_feature_flags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # engagement_types: default billing mode + default fixed fee per package.
    op.execute(
        """
        ALTER TABLE engagement_types
          ADD COLUMN billing_mode text NOT NULL DEFAULT 'hourly'
            CONSTRAINT engagement_types_billing_mode_chk
            CHECK (billing_mode IN ('hourly', 'fixed')),
          ADD COLUMN default_fixed_fee numeric(12, 2),
          ADD CONSTRAINT engagement_types_fixed_fee_chk CHECK (
            (billing_mode = 'hourly' AND default_fixed_fee IS NULL) OR
            (billing_mode = 'fixed'  AND default_fixed_fee IS NOT NULL
                                     AND default_fixed_fee >= 0)
          )
        """
    )

    # engagements: snapshot of the mode + the negotiated fee for THIS deal.
    # fixed_fee is nullable (price-TBD is allowed); contract creation is gated
    # on it at the app layer.
    op.execute(
        """
        ALTER TABLE engagements
          ADD COLUMN billing_mode text NOT NULL DEFAULT 'hourly'
            CONSTRAINT engagements_billing_mode_chk
            CHECK (billing_mode IN ('hourly', 'fixed')),
          ADD COLUMN fixed_fee numeric(12, 2)
            CONSTRAINT engagements_fixed_fee_nonneg_chk
            CHECK (fixed_fee IS NULL OR fixed_fee >= 0)
        """
    )

    # contract_templates: tag services-contract templates by mode so the app
    # can auto-pick fixed vs hourly. NULL = universal fallback.
    op.execute(
        """
        ALTER TABLE contract_templates
          ADD COLUMN billing_mode text
            CONSTRAINT contract_templates_billing_mode_chk
            CHECK (billing_mode IN ('hourly', 'fixed'))
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE contract_templates DROP COLUMN IF EXISTS billing_mode")
    op.execute(
        "ALTER TABLE engagements "
        "DROP COLUMN IF EXISTS fixed_fee, DROP COLUMN IF EXISTS billing_mode"
    )
    op.execute(
        "ALTER TABLE engagement_types "
        "DROP COLUMN IF EXISTS default_fixed_fee, DROP COLUMN IF EXISTS billing_mode"
    )
