"""records request: new agreement type, send log, auto-send flag; retire medical release

After a family signs the services contract they receive a Records Request —
a letter + checklist PDF listing the records to gather and send for review.
It is sent, never signed, and can be re-sent; every send is logged.

- agreement_type gains 'records_request'. (ALTER TYPE ... ADD VALUE can't run
  inside the migration transaction, hence the autocommit block; the value is
  usable by the statements that follow because that block commits first.)
- agreements.auto_send_records_request: set when the operator sends the
  services contract for signature and opts in; on e-signature the backend
  creates the Records Request from its template and emails it.
- agreement_emails: append-only log of every agreement email (records
  request sends today), mirroring invoice_emails.
- Seed the default Records Request template (editable under Catalog ->
  Templates). Placeholders are all existing render-context variables.
- Retire the Medical records release: the form isn't practical (every
  records holder requires its own release), so the template is deactivated.
  The enum value and the one signed release in production are kept.

Revision ID: 0041_records_request
Revises: 0040_contract_non_exclusive
Create Date: 2026-09-20
"""
from alembic import op

revision: str = "0041_records_request"
down_revision = "0040_contract_non_exclusive"
branch_labels = None
depends_on = None


RECORDS_REQUEST_MD = """# RECORDS REQUEST

{{effective_date}}

Dear {{client_name}},

Thank you for engaging {{consultant_company}}. Now that our services agreement is in place, the next step is to gather the records that will inform my review of {{patient_full_name}}'s needs and the school options we consider together.

Please collect and send whichever of the following you have. Copies are fine — nothing needs to be certified or original.

## Records to send

- **Educational plans:** current and prior IEPs or 504 Plans, including evaluation reports, eligibility determinations, and meeting notes
- **Evaluations:** psychoeducational, neuropsychological, speech-language, occupational therapy, or other professional evaluations
- **Academic records:** report cards and transcripts for the last two to three years
- **Testing:** standardized and state assessment results
- **School feedback:** teacher comments, progress reports, or behavior plans
- **Attendance and discipline records**, if any
- **Health information relevant to learning:** medical, therapeutic, or counseling summaries, at your discretion
- **Prior applications:** school applications, admissions correspondence, or acceptance letters
- **Work samples:** writing samples or projects, if available

## How to send them

Reply to this email with the documents attached, or bring copies to our next meeting. Photos or scans of paper records are fine.

Schools, evaluators, and providers generally require their own release form before sending records directly to a third party, so it is usually fastest to request copies yourself and forward them to me. If a specific record is easier for me to request, I will let you know and provide whatever form the provider needs.

Everything you send is handled in accordance with the confidentiality terms of our agreement.

Thank you,

**{{consultant_name}}**

{{consultant_company}}

{{consultant_email}} · {{consultant_phone}}"""


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE agreement_type ADD VALUE IF NOT EXISTS 'records_request'")

    op.execute(
        """
        ALTER TABLE agreements
            ADD COLUMN auto_send_records_request BOOLEAN NOT NULL DEFAULT false;

        CREATE TABLE agreement_emails (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agreement_id    UUID NOT NULL
                              REFERENCES agreements(id) ON DELETE CASCADE,
            purpose         TEXT NOT NULL DEFAULT 'records_request',
            to_address      TEXT NOT NULL,
            cc_addresses    TEXT[] NOT NULL DEFAULT '{}',
            bcc_addresses   TEXT[] NOT NULL DEFAULT '{}',
            subject         TEXT NOT NULL,
            body            TEXT NOT NULL,
            sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            sent_by         UUID REFERENCES people(id) ON DELETE SET NULL,
            smtp_message_id TEXT
        );

        CREATE INDEX agreement_emails_agreement_id_idx
            ON agreement_emails (agreement_id, sent_at DESC);

        CREATE TRIGGER agreement_emails_audit
            AFTER INSERT OR DELETE OR UPDATE ON agreement_emails
            FOR EACH ROW EXECUTE FUNCTION audit_trigger();

        UPDATE contract_templates
           SET is_active = false
         WHERE kind = 'medical_release' AND deleted_at IS NULL;
        """
    )
    op.execute(
        "INSERT INTO contract_templates (kind, name, body_markdown, is_active, sort_order) "
        "SELECT 'records_request'::agreement_type, 'Records request', "
        f"$md${RECORDS_REQUEST_MD}$md$, true, 20 "
        "WHERE NOT EXISTS (SELECT 1 FROM contract_templates WHERE kind = 'records_request')"
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM contract_templates WHERE kind = 'records_request';
        UPDATE contract_templates SET is_active = true
         WHERE kind = 'medical_release' AND deleted_at IS NULL;
        DROP TABLE IF EXISTS agreement_emails;
        ALTER TABLE agreements DROP COLUMN IF EXISTS auto_send_records_request;
        -- The enum value stays: Postgres can't drop enum values.
        """
    )
