"""invoice_emails — audit log for invoice email sends

Slice 6a backing table. POST /api/invoices/{id}/email writes one row
per successful send so the operator can see when (and to whom) each
invoice was actually emailed. Used by the InvoiceDetail "Sent emails"
log in the SPA.

Only successful sends land here; failures bubble up as HTTPException
to the caller, who can retry. Keeping the table success-only avoids
turning it into a debugging dumpster.

Revision ID: 0021_invoice_emails
Revises: 0020_time_entry_task_link
Create Date: 2026-05-26
"""
from alembic import op

revision: str = "0021_invoice_emails"
down_revision = "0020_time_entry_task_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE invoice_emails (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            invoice_id      UUID NOT NULL
                              REFERENCES invoices(id) ON DELETE CASCADE,
            to_address      TEXT NOT NULL,
            cc_addresses    TEXT[] NOT NULL DEFAULT '{}',
            bcc_addresses   TEXT[] NOT NULL DEFAULT '{}',
            subject         TEXT NOT NULL,
            body            TEXT NOT NULL,
            sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            sent_by         UUID REFERENCES people(id) ON DELETE SET NULL,
            smtp_message_id TEXT
        );

        CREATE INDEX invoice_emails_invoice_id_idx
            ON invoice_emails (invoice_id, sent_at DESC);

        -- Audit + updated_at triggers match the convention used by the
        -- other domain tables. updated_at column not added since this
        -- table is append-only — no rows are ever mutated after insert.
        CREATE TRIGGER invoice_emails_audit
            AFTER INSERT OR DELETE OR UPDATE ON invoice_emails
            FOR EACH ROW EXECUTE FUNCTION audit_trigger();
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS invoice_emails;
        """
    )
