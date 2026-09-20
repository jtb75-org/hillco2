"""fixed-fee §4.2: broaden "substantial completion" and the Client-delay clause

Two paragraphs of the fixed-fee contract's §4.2 Payment Schedule (added in
0037) are reworded:
- substantial completion is no longer tied to the assessment / school-search
  activities specifically; it is reaching, or being ready to deliver, the
  principal Services and deliverables in Section 2, notwithstanding
  incidental follow-up, administrative matters, or other minor open items;
- Client delay (now also listing meetings, reviewing deliverables and
  submitting materials) does not postpone substantial completion itself,
  not only payment.

Fixed-fee contract only, scoped by the presence of {{fixed_fee}}. Matched
on the exact current paragraphs so an operator-edited §4 is left alone.

Revision ID: 0039_contract_completion_def
Revises: 0038_contract_records_return
Create Date: 2026-09-20
"""
from alembic import op

revision: str = "0039_contract_completion_def"
down_revision = "0038_contract_records_return"
branch_labels = None
depends_on = None


DEF_OLD = """For purposes of this Agreement, substantial completion occurs when Consultant has completed the principal assessment and school-search activities described in Section 2 and has delivered, or is prepared to present, Consultant's findings and recommendations to Client."""

DEF_NEW = """For purposes of this Agreement, "substantial completion" occurs when Consultant has completed, or is prepared to deliver, the principal Services and deliverables identified in Section 2, notwithstanding incidental follow-up activities, administrative matters, or other minor items that may remain outstanding."""

DELAY_OLD = """Client's delay or failure to schedule or participate in the findings and recommendations meeting, provide requested information, make decisions, or otherwise participate in the engagement shall not postpone payment for Services that Consultant has substantially completed."""

DELAY_NEW = """Client's delay or failure to provide requested information, schedule or participate in meetings, make decisions, review deliverables, submit materials, or otherwise participate in the engagement shall not postpone substantial completion or payment for Services Consultant has otherwise substantially performed."""


# Only the fixed-fee contract carries {{fixed_fee}} (0028 removed it from the
# hourly one).
_FIXED_ONLY = "position('{{fixed_fee}}' in body_markdown) > 0"


def _swap(a: str, b: str) -> None:
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $old${a}$old$, $new${b}$new$) "
        f"WHERE kind = 'services_contract' AND {_FIXED_ONLY}"
    )


def upgrade() -> None:
    _swap(DEF_OLD, DEF_NEW)
    _swap(DELAY_OLD, DELAY_NEW)


def downgrade() -> None:
    _swap(DELAY_NEW, DELAY_OLD)
    _swap(DEF_NEW, DEF_OLD)
