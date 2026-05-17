"""agreements.template_id + body_markdown

PR-Tail step 2: tie agreements to their source template + snapshot
the markdown body per-agreement so operator edits don't drift the
template wording. Tail-3 will fill the {{variable}} placeholders +
render to PDF.

- agreements.template_id: nullable FK to contract_templates with
  ON DELETE SET NULL. Templates can be soft-deleted via their own
  flow; the FK survives that so existing agreements retain their
  template attribution by id (though the SET NULL fires only on
  hard delete).
- agreements.body_markdown: TEXT. Cloned from the chosen template at
  create time; the operator edits this copy on the engagement page
  without affecting the template.

Revision ID: 0017_agreement_body
Revises: 0016_seed_medrel_template
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0017_agreement_body"
down_revision = "0016_seed_medrel_template"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE agreements
            ADD COLUMN template_id UUID
                REFERENCES contract_templates(id) ON DELETE SET NULL,
            ADD COLUMN body_markdown TEXT;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE agreements
            DROP COLUMN IF EXISTS body_markdown,
            DROP COLUMN IF EXISTS template_id;
        """
    )
