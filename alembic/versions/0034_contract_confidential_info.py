"""define "Confidential Information" in the services-contract confidentiality clause

Section 8 obligated the Consultant to keep "Client information and educational
records" confidential without defining the term. Add a Confidential Information
definition at the top of §8 (both the Standard/hourly and Fixed-fee services
contracts share the identical block) and tie the obligation sentence to the
defined term. Non-destructive: a template whose §8 has been operator-edited away
from the exact block is left alone.

Revision ID: 0034_contract_confidential_info
Revises: 0033_medrel_single_expiration
Create Date: 2026-09-15
"""
from alembic import op

revision: str = "0034_contract_confidential_info"
down_revision = "0033_medrel_single_expiration"
branch_labels = None
depends_on = None


OLD = """# 8. CONFIDENTIALITY

Consultant shall maintain the confidentiality of Client information and educational records and shall not disclose such information except:"""

NEW = """# 8. CONFIDENTIALITY

Confidential Information includes, but is not limited to: written, printed, or electronically recorded materials furnished by the Client for the Consultant to use; the student's educational, psychological, medical, therapeutic, and behavioral records, evaluations, assessments, IEPs, and 504 Plans; and personal, family, and financial information concerning the Client and student.

Consultant shall maintain the confidentiality of the Client's Confidential Information and educational records and shall not disclose such information except:"""


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
