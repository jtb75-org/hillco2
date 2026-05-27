"""google_oauth_tokens — persisted Google API credentials

Revision ID: 0022_google_oauth_tokens
Revises: 0021_invoice_emails
Create Date: 2026-05-27
"""
from alembic import op

revision: str = "0022_google_oauth_tokens"
down_revision = "0021_invoice_emails"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE google_oauth_tokens (
            person_id uuid PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
            refresh_token text,
            access_token text,
            access_token_expires_at timestamptz,
            scope text,
            updated_at timestamptz NOT NULL DEFAULT NOW()
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS google_oauth_tokens;")
