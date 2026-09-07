"""seed the fixed-fee services contract template

Tags the existing services contract as billing_mode='hourly' and seeds a new
fixed-fee variant (billing_mode='fixed'). The fixed template swaps the hourly
compensation + retainer sections for a fixed-fee + scope/change-order, and is
otherwise the same educational-consulting agreement. Consultants review/edit
the wording in Catalog -> Contracts before use.

Revision ID: 0026_seed_fixed_bid_template
Revises: 0025_engagement_billing_mode
Create Date: 2026-09-07
"""
from alembic import op

revision: str = "0026_seed_fixed_bid_template"
down_revision = "0025_engagement_billing_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing services contract(s) are the hourly/T&M flavor.
    op.execute(
        """
        UPDATE contract_templates
        SET billing_mode = 'hourly'
        WHERE kind = 'services_contract' AND billing_mode IS NULL
        """
    )
    op.execute(FIXED_BID_SEED)


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM contract_templates
        WHERE kind = 'services_contract'
          AND name = 'Fixed-fee educational consulting services agreement'
        """
    )


FIXED_BID_SEED = r"""
INSERT INTO contract_templates (kind, name, sort_order, billing_mode, body_markdown) VALUES (
  'services_contract',
  'Fixed-fee educational consulting services agreement',
  15,
  'fixed',
  $$# EDUCATIONAL CONSULTING SERVICES AGREEMENT (FIXED FEE)

This Educational Consulting Services Agreement ("Agreement") is entered into as of **{{effective_date}}**, by and between:

**{{consultant_name}}**, located at **{{consultant_address}}** ("Consultant")

and

**{{client_name}}**, located at **{{client_address}}** ("Client").

Collectively referred to as the "Parties."

---

# 1. PURPOSE

Client desires to engage Consultant to provide educational consulting and advisory services related to special education needs, school placement evaluation, admissions guidance, and related support services. Consultant agrees to provide such services under the terms of this Agreement.

---

# 2. SERVICES

Consultant shall provide educational consulting services for a **fixed fee** covering the defined scope of work described below. Services may include, but are not limited to:

## Representative Services

- Reviewing educational records, evaluations, IEPs, 504 Plans, neuropsychological assessments, behavioral reports, and related documentation
- Assisting families in evaluating educational placement options
- Researching and recommending public, private, therapeutic, boarding, or specialized school programs
- Participating in meetings with parents, educators, administrators, clinicians, or advocates
- Advising on school admissions processes and application requirements
- Supporting prospective students with admissions preparation and interview coaching
- Coordinating with educational professionals, therapists, or schools as authorized by Client
- Assisting with transition planning and educational strategy development
- Providing written summaries, recommendations, or consultation notes
- Traveling to schools, meetings, evaluations, or educational facilities as reasonably necessary
- Other educational consulting services mutually agreed upon by the Parties

Consultant does not guarantee admission to any educational institution or any particular educational outcome.

---

# 3. TERM

This Agreement shall begin on the Effective Date and continue until the Services are completed or the Agreement is terminated by either Party pursuant to this Agreement.

Either Party may terminate this Agreement at any time upon written notice to the other Party. Upon termination, fees shall be prorated for the portion of the Services completed as of the termination date.

---

# 4. COMPENSATION

## 4.1 Fixed Fee

Client agrees to compensate Consultant a fixed fee of **${{fixed_fee}}** for the scope of Services described in Section 2.

The fixed fee is not contingent on the amount of time spent and covers all consulting services within the defined scope.

## 4.2 Payment Schedule

Payment shall be made according to the following schedule: **{{payment_schedule}}**

Invoices are due within **{{payment_terms_days}} days** of invoice date.

Late payments may accrue interest at the rate of **1.5% per month** or the maximum rate permitted by law.

---

# 5. SCOPE AND CHANGE ORDERS

The fixed fee covers only the scope of Services defined in this Agreement.

Services requested outside the defined scope ("Additional Services") shall be agreed upon in writing before commencement and billed separately, either as an additional fixed fee or at an hourly rate of **${{hourly_rate}} per hour**, as mutually agreed.

Reimbursable expenses under Section 6 are billed separately and are not included in the fixed fee.

---

# 6. EXPENSES

Client shall reimburse Consultant for reasonable out-of-pocket expenses incurred in connection with the Services, including but not limited to:

- Airfare
- Hotel accommodations
- Mileage at the current IRS reimbursement rate
- Parking and tolls
- Meals during travel
- Ground transportation
- Shipping, copying, or document retrieval fees

Consultant shall obtain Client approval for any individual expense exceeding **${{expense_approval_threshold}}**.

---

# 7. CLIENT RESPONSIBILITIES

Client agrees to:

- Provide accurate and complete information relevant to the Services
- Timely provide records, evaluations, and requested documentation
- Authorize Consultant to communicate with schools or third parties when necessary
- Make timely decisions regarding applications, placements, and recommendations
- Pay invoices in accordance with this Agreement

---

# 8. CONFIDENTIALITY

Consultant shall maintain the confidentiality of Client information and educational records and shall not disclose such information except:

- As authorized by Client
- As required by law
- As reasonably necessary to perform the Services

Client acknowledges that electronic communications may not be completely secure.

---

# 9. FERPA AUTHORIZATION

Client authorizes Consultant to communicate with schools, educational institutions, evaluators, therapists, counselors, administrators, and related professionals as reasonably necessary to perform the Services described in this Agreement.

Client further authorizes Consultant to review and discuss educational records, evaluations, assessments, IEPs, 504 Plans, admissions materials, and related documentation concerning the prospective or enrolled student.

Client acknowledges that educational records may be protected under the Family Educational Rights and Privacy Act ("FERPA"), and Client agrees to execute any additional school-specific authorization or release forms required by an educational institution.

Consultant agrees to maintain the confidentiality of such records in accordance with applicable law and the confidentiality provisions of this Agreement.

---

# 10. NO LEGAL OR MEDICAL ADVICE

Consultant is not providing legal, medical, psychological, or clinical services unless specifically licensed and separately contracted to do so.

Consultant''s recommendations are advisory in nature and are based on information available at the time of consultation.

---

# 11. FAMILY DECISION-MAKING ACKNOWLEDGMENT

Client acknowledges and agrees that Consultant provides advisory and consulting services only.

All decisions regarding:

- School applications
- Admissions submissions
- Educational placements
- Enrollment decisions
- Acceptance or rejection of recommendations
- Participation in educational programs or services

shall remain solely the responsibility of the Client and family.

Client further acknowledges that Consultant does not guarantee admission, acceptance, placement, educational success, or any specific outcome.

---

# 12. INDEPENDENT CONTRACTOR

Consultant is an independent contractor and not an employee, agent, or representative of Client.

Consultant shall be solely responsible for taxes, insurance, and other obligations arising from Consultant''s business operations.

---

# 13. NON-SOLICITATION

During the term of this Agreement and for a period of twelve (12) months following termination of the Agreement, Client agrees not to directly solicit for employment or independent engagement any employee, contractor, subcontractor, or affiliated consultant of Consultant without prior written consent.

This provision shall not prohibit general employment advertisements not specifically directed toward such individuals.

---

# 14. LIMITATION OF LIABILITY

To the fullest extent permitted by law, Consultant''s liability under this Agreement shall not exceed the total amount paid by Client under this Agreement.

In no event shall Consultant be liable for indirect, incidental, consequential, or special damages, including denial of admission or educational placement outcomes.

---

# 15. GOVERNING LAW

This Agreement shall be governed by and construed in accordance with the laws of the State of **{{governing_state}}**, without regard to conflict of law principles.

---

# 16. ENTIRE AGREEMENT

This Agreement constitutes the entire agreement between the Parties and supersedes all prior discussions or understandings relating to the subject matter herein.

Any amendments must be in writing and signed by both Parties.

---

# 17. OPTIONAL SIGNATURE ACKNOWLEDGMENT FOR STUDENT RECORD ACCESS

The Parties acknowledge and agree that Consultant may access confidential student educational information solely for purposes authorized under this Agreement.

Client Initials: _________

Consultant Initials: _________

---

# 18. SIGNATURES

## CONSULTANT

Name: _______________________________

Signature: ____________________________

Date: ________________________________

---

## CLIENT

Name: _______________________________

Signature: ____________________________

Date: ________________________________$$
);
"""
