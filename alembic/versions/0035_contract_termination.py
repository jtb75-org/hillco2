"""expand §3 TERM into TERM AND TERMINATION in both services contracts

The old §3 was two sentences: runs until terminated, either party may
terminate on written notice. Replace it with a fuller clause — §3.1 mutual
termination, §3.2 the grounds on which the Consultant may suspend or
terminate (non-payment, non-cooperation, false or withheld information,
abusive conduct, material breach, or an engagement that can no longer be
appropriately continued), and §3.3 the effect of termination.

The two contracts' old blocks differ (the fixed-fee one already carried a
proration sentence), so each is matched and replaced on its own exact text.
§3.3's fixed-fee refund paragraph is specific to that contract; the hourly
contract instead defers to its existing §5 retainer refund language.
Non-destructive: a template whose §3 has been operator-edited away from the
exact block is left alone (replace() is a no-op).

Revision ID: 0035_contract_termination
Revises: 0034_contract_confidential_info
Create Date: 2026-09-20
"""
from alembic import op

revision: str = "0035_contract_termination"
down_revision = "0034_contract_confidential_info"
branch_labels = None
depends_on = None


# ---- shared new clauses -----------------------------------------------------

_INTRO = """# 3. TERM AND TERMINATION

This Agreement shall begin on the Effective Date and continue until the Services are completed or this Agreement is terminated in accordance with this Section.

## 3.1 Termination by Either Party

Either Party may terminate this Agreement at any time upon written notice to the other Party.

## 3.2 Termination or Suspension by Consultant

Consultant may suspend Services or terminate this Agreement upon written notice if Client:

- fails to make payments when due;
- fails to provide records, information, authorizations, or cooperation reasonably necessary for Consultant to perform the Services;
- provides materially false, inaccurate, incomplete, or misleading information;
- intentionally withholds information that Consultant reasonably believes is material to the Services or recommendations;
- engages in threatening, abusive, harassing, unlawful, or otherwise inappropriate conduct toward Consultant, Consultant's personnel, schools, or other professionals involved in the engagement; or
- otherwise materially breaches this Agreement.

Consultant may also terminate the engagement if Consultant determines that continued representation would be inappropriate, impracticable, outside Consultant's expertise or scope of services, or not in the best interests of the engagement.

## 3.3 Effect of Termination

Upon termination, Consultant shall cease providing Services except as reasonably necessary to conclude the engagement. Client shall remain responsible for Services performed, Additional Services authorized, and reimbursable expenses incurred through the effective date of termination."""

# ---- Standard (hourly) services agreement -----------------------------------

HOURLY_OLD = """# 3. TERM

This Agreement shall begin on the Effective Date and continue until terminated by either Party pursuant to this Agreement.

Either Party may terminate this Agreement at any time upon written notice to the other Party."""

HOURLY_NEW = _INTRO + """

Any unused portion of the retainer shall be refunded in accordance with Section 5."""

# ---- Fixed-fee services agreement -------------------------------------------

FIXED_OLD = """# 3. TERM

This Agreement shall begin on the Effective Date and continue until the Services are completed or the Agreement is terminated by either Party pursuant to this Agreement.

Either Party may terminate this Agreement at any time upon written notice to the other Party. Upon termination, fees shall be prorated for the portion of the Services completed as of the termination date."""

FIXED_NEW = _INTRO + """

Because the Services are provided for a fixed fee and portions of the work may be performed at different stages of the engagement, any refund of prepaid fees shall be based upon the portion of the Services reasonably completed as of the termination date rather than solely upon elapsed time. Consultant shall provide Client with a final accounting and refund any unearned prepaid fees, if applicable."""


def _swap(a: str, b: str) -> None:
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $old${a}$old$, $new${b}$new$) "
        "WHERE kind = 'services_contract'"
    )


def upgrade() -> None:
    _swap(HOURLY_OLD, HOURLY_NEW)
    _swap(FIXED_OLD, FIXED_NEW)


def downgrade() -> None:
    _swap(HOURLY_NEW, HOURLY_OLD)
    _swap(FIXED_NEW, FIXED_OLD)
