"""expand §7 CLIENT RESPONSIBILITIES in both services contracts

The old §7 was five short bullets. Replace it with seven fuller duties:
truthful and timely information; prompt disclosure of material changes or
omissions; timely records and evaluations; obtaining third-party
authorizations; timely decisions; reasonable cooperation; and payment of
invoices and reimbursable expenses.

The Standard (hourly) and Fixed-fee contracts share the identical §7 block,
so one replace covers both. Non-destructive: a template whose §7 has been
operator-edited away from the exact block is left alone (replace() is a
no-op).

Revision ID: 0036_contract_client_duties
Revises: 0035_contract_termination
Create Date: 2026-09-20
"""
from alembic import op

revision: str = "0036_contract_client_duties"
down_revision = "0035_contract_termination"
branch_labels = None
depends_on = None


OLD = """# 7. CLIENT RESPONSIBILITIES

Client agrees to:

- Provide accurate and complete information relevant to the Services
- Timely provide records, evaluations, and requested documentation
- Authorize Consultant to communicate with schools or third parties when necessary
- Make timely decisions regarding applications, placements, and recommendations
- Pay invoices in accordance with this Agreement"""

NEW = """# 7. CLIENT RESPONSIBILITIES

Client agrees to:

- Provide truthful, accurate, complete, and timely information and records relevant to the Services;
- Promptly disclose any material changes, omissions, errors, or additional information that may reasonably affect Consultant's assessment, recommendations, or ability to perform the Services;
- Timely provide requested educational records, evaluations, assessments, medical or psychological information, and other documentation reasonably necessary for the Services;
- Obtain and provide any authorizations or consents reasonably necessary for Consultant to communicate with schools, healthcare providers, evaluators, therapists, or other third parties;
- Make timely decisions regarding applications, placements, recommendations, and other matters requiring Client approval;
- Cooperate reasonably with Consultant in the performance of the Services; and
- Pay invoices and reimbursable expenses in accordance with this Agreement."""


def _swap(a: str, b: str) -> None:
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $old${a}$old$, $new${b}$new$) "
        "WHERE kind = 'services_contract'"
    )


def upgrade() -> None:
    _swap(OLD, NEW)


def downgrade() -> None:
    _swap(NEW, OLD)
