"""rewrite fixed-fee §4–§6 and the shared §8 in the services contracts

Fixed-fee contract only (§4 COMPENSATION, §5 SCOPE AND CHANGE ORDERS,
§6 EXPENSES):
- §4.2 replaces the operator-typed {{payment_schedule}} line and the
  {{payment_terms_days}} sentence with a fixed two-installment schedule —
  50% on execution, 50% on substantial completion — using the new
  backend-derived {{fixed_fee_half}}, defines substantial completion, and
  says Client delay doesn't postpone payment. §4.1 ties out-of-scope work
  to §5.
- §5 gains what counts as written approval for Additional Services,
  examples, and that Consultant needn't start until they're approved.
- §6 adds a catch-all reimbursable line, how expense approval may be given,
  pre-approval of significant travel, that travel time is inside the fixed
  fee, and how expenses are invoiced.
These blocks are identical in the hourly contract for §6 (and structurally
similar for §4), so they're scoped to the template that carries
{{fixed_fee}} — only the fixed-fee contract does (0028 dropped it from the
hourly one).

Both contracts (§8 CONFIDENTIALITY): keeps the 0034 Confidential
Information definition and defined-term obligation, punctuates the
exception bullets, and adds sharing with Consultant's staff, safeguards,
authorised electronic systems (superseding the one-line security
acknowledgment), record retention, and survival.

Matched on the exact current blocks, so an operator-edited section is left
alone.

Revision ID: 0037_contract_sections_4_to_8
Revises: 0036_contract_client_duties
Create Date: 2026-09-20
"""
from alembic import op

revision: str = "0037_contract_sections_4_to_8"
down_revision = "0036_contract_client_duties"
branch_labels = None
depends_on = None


# ---- fixed-fee contract only --------------------------------------------------

S4_OLD = """# 4. COMPENSATION

## 4.1 Fixed Fee

Client agrees to compensate Consultant a fixed fee of **${{fixed_fee}}** for the scope of Services described in Section 2.

The fixed fee is not contingent on the amount of time spent and covers all consulting services within the defined scope.

## 4.2 Payment Schedule

Payment shall be made according to the following schedule: **{{payment_schedule}}**

Invoices are due within **{{payment_terms_days}} days** of invoice date.

Late payments may accrue interest at the rate of **1.5% per month** or the maximum rate permitted by law."""

S4_NEW = """# 4. COMPENSATION

## 4.1 Fixed Fee

Client agrees to compensate Consultant a fixed fee of **${{fixed_fee}}** for the scope of Services described in Section 2.

The fixed fee is not contingent upon the amount of time spent by Consultant and covers all consulting services within the defined scope. Services requested outside the defined scope shall be considered Additional Services and handled in accordance with Section 5.

## 4.2 Payment Schedule

The fixed fee shall be payable as follows:

- 50% (**${{fixed_fee_half}}**) upon execution of this Agreement; and
- 50% (**${{fixed_fee_half}}**) upon substantial completion of the Services.

The initial payment must be received before Consultant begins substantive work under the engagement.

For purposes of this Agreement, substantial completion occurs when Consultant has completed the principal assessment and school-search activities described in Section 2 and has delivered, or is prepared to present, Consultant's findings and recommendations to Client.

Client's delay or failure to schedule or participate in the findings and recommendations meeting, provide requested information, make decisions, or otherwise participate in the engagement shall not postpone payment for Services that Consultant has substantially completed.

The final payment is due upon substantial completion. Reimbursable expenses and Additional Services, if any, shall be invoiced separately in accordance with this Agreement.

Late payments may accrue interest at the rate of **1.5% per month** or the maximum rate permitted by law, whichever is less."""

S5_OLD = """# 5. SCOPE AND CHANGE ORDERS

The fixed fee covers only the scope of Services defined in this Agreement.

Services requested outside the defined scope ("Additional Services") shall be agreed upon in writing before commencement and billed separately, either as an additional fixed fee or at an hourly rate to be mutually agreed upon in writing.

Reimbursable expenses under Section 6 are billed separately and are not included in the fixed fee."""

S5_NEW = """# 5. SCOPE AND CHANGE ORDERS

The fixed fee covers only the scope of Services defined in this Agreement.

Services requested outside the defined scope ("Additional Services") shall be agreed upon in writing before commencement and billed separately, either as an additional fixed fee or at an hourly rate to be mutually agreed upon in writing.

For purposes of this Section, written approval may include email, electronic message through Consultant's client portal, electronic change order, or other written electronic communication in which Client clearly authorizes the Additional Services and applicable fees. A formal amendment to this Agreement signed by both Parties shall not be required for such approval.

Examples of Additional Services may include, but are not limited to, services related to additional school searches beyond the original engagement, admissions or application assistance, additional school visits or meetings, extended consultation following delivery of recommendations, or other services not reasonably contemplated by the scope described in Section 2.

Consultant is not obligated to perform Additional Services until Client has approved the scope and applicable fees.

Reimbursable expenses under Section 6 are billed separately and are not included in the fixed fee."""

S6_OLD = """# 6. EXPENSES

Client shall reimburse Consultant for reasonable out-of-pocket expenses incurred in connection with the Services, including but not limited to:

- Airfare
- Hotel accommodations
- Mileage at the current IRS reimbursement rate
- Parking and tolls
- Meals during travel
- Ground transportation
- Shipping, copying, or document retrieval fees

Consultant shall obtain Client approval for any individual expense exceeding **${{expense_approval_threshold}}**."""

S6_NEW = """# 6. EXPENSES

Client shall reimburse Consultant for reasonable out-of-pocket expenses incurred in connection with the Services, including but not limited to:

- Airfare
- Hotel accommodations
- Mileage at the current IRS reimbursement rate
- Parking and tolls
- Meals during travel
- Ground transportation
- Shipping, copying, or document retrieval fees
- Other reasonable third-party costs incurred specifically on Client's behalf and with Client's authorization

Consultant shall obtain Client approval for any individual expense exceeding **${{expense_approval_threshold}}**. Such approval may be provided by email, through Consultant's client portal, or by other written electronic communication.

Whenever reasonably practicable, Consultant shall obtain Client approval before incurring significant travel expenses, including airfare and hotel accommodations, regardless of whether any individual expense exceeds the approval threshold.

Travel time associated with Services included within the scope of this Agreement is included in the fixed fee and will not be billed separately. Reasonable travel expenses remain reimbursable as provided in this Section.

Reimbursable expenses are separate from, and are not included in, the fixed fee described in Section 4. Consultant may invoice reimbursable expenses as they are incurred or include them on the next invoice issued to Client."""

# ---- both services contracts ------------------------------------------------

S8_OLD = """# 8. CONFIDENTIALITY

Confidential Information includes, but is not limited to: written, printed, or electronically recorded materials furnished by the Client for the Consultant to use; the student's educational, psychological, medical, therapeutic, and behavioral records, evaluations, assessments, IEPs, and 504 Plans; and personal, family, and financial information concerning the Client and student.

Consultant shall maintain the confidentiality of the Client's Confidential Information and educational records and shall not disclose such information except:

- As authorized by Client
- As required by law
- As reasonably necessary to perform the Services

Client acknowledges that electronic communications may not be completely secure."""

S8_NEW = """# 8. CONFIDENTIALITY

Confidential Information includes, but is not limited to: written, printed, or electronically recorded materials furnished by the Client for the Consultant to use; the student's educational, psychological, medical, therapeutic, and behavioral records, evaluations, assessments, IEPs, and 504 Plans; and personal, family, and financial information concerning the Client and student.

Consultant shall maintain the confidentiality of the Client's Confidential Information and educational records and shall not disclose such information except:

- As authorized by Client;
- As required by law; or
- As reasonably necessary to perform the Services.

Consultant may share Client information with Consultant's employees, contractors, service providers, or other professionals assisting Consultant in the performance or administration of the Services, provided such persons have a legitimate need for the information and are subject to appropriate confidentiality obligations.

Consultant shall use reasonable administrative, technical, and physical safeguards appropriate to the nature and sensitivity of the information maintained by Consultant.

Client authorizes Consultant to use electronic communications and systems, including email, electronic messaging, videoconferencing, electronic document storage, and Consultant's client portal, in connection with the Services. Client acknowledges that no method of electronic communication or storage can be guaranteed to be completely secure.

Consultant may retain Client records and communications for legitimate business, legal, recordkeeping, and compliance purposes following completion or termination of the engagement. Consultant may thereafter securely delete or destroy such records in accordance with Consultant's record-retention practices and applicable law.

The confidentiality obligations contained in this Section shall survive completion or termination of this Agreement."""


# Only the fixed-fee contract carries {{fixed_fee}} (0028 removed it from the
# hourly one), which makes it a content-based discriminator that doesn't
# depend on the template's name.
_FIXED_ONLY = "position('{{fixed_fee}}' in body_markdown) > 0"


def _swap(a: str, b: str, *, fixed_only: bool = False) -> None:
    where = "kind = 'services_contract'"
    if fixed_only:
        where += f" AND {_FIXED_ONLY}"
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $old${a}$old$, $new${b}$new$) "
        f"WHERE {where}"
    )


def upgrade() -> None:
    _swap(S4_OLD, S4_NEW, fixed_only=True)
    _swap(S5_OLD, S5_NEW, fixed_only=True)
    _swap(S6_OLD, S6_NEW, fixed_only=True)
    _swap(S8_OLD, S8_NEW)


def downgrade() -> None:
    _swap(S8_NEW, S8_OLD)
    _swap(S6_NEW, S6_OLD, fixed_only=True)
    _swap(S5_NEW, S5_OLD, fixed_only=True)
    _swap(S4_NEW, S4_OLD, fixed_only=True)
