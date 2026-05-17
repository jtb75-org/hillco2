"""contract_templates table

PR-Tail step 1: contracts as first-class data. Today an agreement is
just a DB row with an amount + contract_number; the actual contract
content lives in a Google Doc / Word file outside the system. This
migration introduces a table for storing reusable markdown contract
templates with {{variable_name}} placeholder syntax.

A subsequent migration / PR will (a) add agreements.body_markdown +
agreements.template_id so each agreement snapshots its source
template at create time, and (b) wire WeasyPrint to render markdown
templates to PDF.

Revision ID: 0015_contract_templates
Revises: 0014_drop_decision_makers
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0015_contract_templates"
down_revision = "0014_drop_decision_makers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE contract_templates (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            kind         agreement_type NOT NULL,
            name         TEXT NOT NULL,
            body_markdown TEXT NOT NULL,
            is_active    BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            deleted_at   TIMESTAMPTZ,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    # updated_at trigger lives in app code on PATCH; not bothering with
    # a DB-level trigger for this table since edits go through routes.

    # Seed a default services_contract template from Joe's pasted text.
    # Bracketed [Title Case] placeholders are converted to
    # {{snake_case}} so variable extraction has one canonical syntax.
    op.execute(SERVICES_CONTRACT_SEED)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS contract_templates;")


SERVICES_CONTRACT_SEED = r"""
INSERT INTO contract_templates (kind, name, sort_order, body_markdown) VALUES (
  'services_contract',
  'Standard educational consulting services agreement',
  10,
  $$# EDUCATIONAL CONSULTING SERVICES AGREEMENT

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

Consultant shall provide educational consulting services on a time and materials basis. Services may include, but are not limited to:

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

This Agreement shall begin on the Effective Date and continue until terminated by either Party pursuant to this Agreement.

Either Party may terminate this Agreement at any time upon written notice to the other Party.

---

# 4. COMPENSATION

## 4.1 Time and Materials

Client agrees to compensate Consultant at the rate of:

- **${{hourly_rate}} per hour** for consulting services
- Billed in increments of **{{billing_increment_minutes}} minutes**

Time billable under this Agreement may include:

- Meetings and consultations
- Phone calls and video conferences
- Research and analysis
- Review of records and documentation
- Travel time
- Preparation of written materials
- Communications with schools or third parties authorized by Client

## 4.2 Invoices and Payment

Consultant shall provide invoices on a **{{invoice_frequency}}** basis.

Payment is due within **{{payment_terms_days}} days** of invoice date.

Late payments may accrue interest at the rate of **1.5% per month** or the maximum rate permitted by law.

---

# 5. RETAINER

Client agrees to provide an initial retainer in the amount of **One Thousand Dollars ($1,000.00)** prior to the commencement of Services.

The retainer shall be applied against future invoices issued under this Agreement. Consultant may require the retainer to be replenished if the remaining balance falls below **$250.00**.

Any unused portion of the retainer shall be refunded to Client within a reasonable time following termination of this Agreement, less any outstanding fees or expenses owed.

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

Consultant's recommendations are advisory in nature and are based on information available at the time of consultation.

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

Consultant shall be solely responsible for taxes, insurance, and other obligations arising from Consultant's business operations.

---

# 13. NON-SOLICITATION

During the term of this Agreement and for a period of twelve (12) months following termination of the Agreement, Client agrees not to directly solicit for employment or independent engagement any employee, contractor, subcontractor, or affiliated consultant of Consultant without prior written consent.

This provision shall not prohibit general employment advertisements not specifically directed toward such individuals.

---

# 14. LIMITATION OF LIABILITY

To the fullest extent permitted by law, Consultant's liability under this Agreement shall not exceed the total amount paid by Client under this Agreement.

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

Date: ________________________________
$$
);
"""
