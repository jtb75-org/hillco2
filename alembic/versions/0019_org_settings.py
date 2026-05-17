"""org_settings — singleton firm-wide config

PR-Tail wrap-up: the firm-wide constants that show up in contract
templates (governing_state, billing_increment_minutes, payment_terms_days,
etc.) didn't belong on each agreement or on each consultant — they
belong here, as a single source of truth for the whole practice.

The render-context helper in agreements.py merges these in BELOW
user-supplied agreement.variables, so per-agreement overrides still
win for the rare case where one contract needs a custom value.

Singleton row pattern: integer primary key locked to 1 via a CHECK
constraint. A seed row is inserted with all fields NULL so the row
always exists; the PATCH endpoint just updates fields in place.

Revision ID: 0019_org_settings
Revises: 0018_agreement_vars
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0019_org_settings"
down_revision = "0018_agreement_vars"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE org_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            firm_name TEXT,
            firm_street1 TEXT,
            firm_street2 TEXT,
            firm_city TEXT,
            firm_state TEXT,
            firm_postal_code TEXT,
            firm_country TEXT,
            governing_state TEXT,
            billing_increment_minutes INTEGER,
            invoice_frequency TEXT,
            payment_terms_days INTEGER,
            expense_approval_threshold NUMERIC(10, 2),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    op.execute("INSERT INTO org_settings (id) VALUES (1);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS org_settings;")
