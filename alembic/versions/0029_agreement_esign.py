"""electronic signature for agreements

Adds the in-app e-signature flow:
- agreements.signing_nonce  — rotates the tokenized signing link (revoke/replace)
- agreements.signing_sent_at — when the signing link was last emailed
- agreement_signatures      — one row per party's electronic signature, with the
  ESIGN/UETA audit trail (name, method, consent, doc hash, IP, user-agent, time)

Revision ID: 0029_agreement_esign
Revises: 0028_fixed_template_drop_hourly
Create Date: 2026-09-13
"""
from alembic import op

revision: str = "0029_agreement_esign"
down_revision = "0028_fixed_template_drop_hourly"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE agreements
          ADD COLUMN signing_nonce uuid,
          ADD COLUMN signing_sent_at timestamptz;
        """
    )
    op.execute(
        """
        CREATE TABLE agreement_signatures (
            id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            agreement_id     uuid NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
            signer_role      text NOT NULL,
            signer_name      text NOT NULL,
            signer_email     text,
            method           text NOT NULL,
            signature_text   text,
            signature_image_key text,
            consent_text     text NOT NULL,
            document_sha256  text NOT NULL,
            ip_address       text,
            user_agent       text,
            signed_at        timestamptz NOT NULL DEFAULT now(),
            created_at       timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT agreement_signatures_role_chk
                CHECK (signer_role IN ('client', 'firm')),
            CONSTRAINT agreement_signatures_method_chk
                CHECK (method IN ('typed', 'drawn'))
        );
        """
    )
    op.execute(
        "CREATE INDEX agreement_signatures_agreement_idx "
        "ON agreement_signatures (agreement_id);"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS agreement_signatures;")
    op.execute(
        "ALTER TABLE agreements "
        "DROP COLUMN IF EXISTS signing_nonce, "
        "DROP COLUMN IF EXISTS signing_sent_at;"
    )
