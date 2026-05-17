"""seed standard medical-records release template

PR-Tail step 1.5: seed the second canonical contract template — the
authorization for release of medical and educational information.
Same {{snake_case}} variable convention as the services agreement
from 0015; ink-signature blocks, "Initial here", and "Other:" lines
stay as underscored handwriting spots.

Revision ID: 0016_seed_medrel_template
Revises: 0015_contract_templates
Create Date: 2026-05-17
"""
from alembic import op

revision: str = "0016_seed_medrel_template"
down_revision = "0015_contract_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(MEDICAL_RELEASE_SEED)


def downgrade() -> None:
    # Drop only the seeded template by name, not the table. Templates
    # the operator created post-migration stay untouched.
    op.execute(
        """
        UPDATE contract_templates
        SET deleted_at = NOW()
        WHERE kind = 'medical_release'
          AND name = 'Standard authorization for release of medical and educational information'
          AND deleted_at IS NULL;
        """
    )


MEDICAL_RELEASE_SEED = r"""
INSERT INTO contract_templates (kind, name, sort_order, body_markdown) VALUES (
  'medical_release',
  'Standard authorization for release of medical and educational information',
  10,
  $$# AUTHORIZATION FOR RELEASE OF MEDICAL AND EDUCATIONAL INFORMATION

## Patient / Student Information

Full Name: **{{patient_full_name}}**

Date of Birth: **{{patient_dob}}**

Address: **{{patient_address}}**

City/State/Zip: **{{patient_city_state_zip}}**

Phone Number: **{{patient_phone}}**

Parent/Guardian Name (if applicable): **{{parent_guardian_name}}**

Relationship to Patient/Student: **{{parent_guardian_relationship}}**

---

# AUTHORIZATION

I hereby authorize the following individual and/or organization to disclose and release medical, psychological, educational, therapeutic, behavioral, and related records and information concerning the above-named individual.

## Releasing Provider / Organization

Name: **{{releasing_provider_name}}**

Address: **{{releasing_provider_address}}**

City/State/Zip: **{{releasing_provider_city_state_zip}}**

Phone: **{{releasing_provider_phone}}**

Fax: **{{releasing_provider_fax}}**

---

# AUTHORIZED RECIPIENT

I authorize release of records to:

## Educational Consultant / Recipient

Name: **{{consultant_name}}**

Company/Organization: **{{consultant_company}}**

Address: **{{consultant_address}}**

City/State/Zip: **{{consultant_city_state_zip}}**

Phone: **{{consultant_phone}}**

Email: **{{consultant_email}}**

---

# INFORMATION TO BE RELEASED

The following records and information may be disclosed:

- Medical records
- Psychological evaluations
- Neuropsychological evaluations
- Psychiatric records
- Therapy and counseling records
- Behavioral assessments
- Educational evaluations
- IEPs and 504 Plans
- Occupational therapy records
- Speech/language evaluations
- Physical therapy records
- Admissions records
- School performance reports
- Testing results
- Progress notes
- Treatment summaries
- Other: ____________________________________________

Date range of records to be released:

From: **{{records_date_from}}**   To: **{{records_date_to}}**

---

# PURPOSE OF RELEASE

The purpose of this disclosure is to assist with:

- Educational consultation
- School placement evaluation
- Admissions assistance
- Academic planning
- Special needs support and advocacy
- Coordination of services
- Other: ____________________________________________

---

# METHOD OF DELIVERY

Records may be delivered by:

- Secure email
- Fax
- Mail
- In-person pickup
- Electronic portal upload

---

# ACKNOWLEDGMENTS

I understand and acknowledge that:

1. This authorization is voluntary.

2. I may revoke this authorization at any time by providing written notice, except to the extent action has already been taken in reliance upon it.

3. Information disclosed pursuant to this authorization may no longer be protected by federal or state privacy laws once released to the authorized recipient.

4. This authorization does not require the release of records prohibited by applicable law.

5. A copy of this authorization shall be considered as valid as the original.

---

# HIPAA AUTHORIZATION

I specifically authorize the release of protected health information ("PHI") as defined under the Health Insurance Portability and Accountability Act of 1996 ("HIPAA"), where applicable.

This authorization includes permission to release records relating to:

- Mental health treatment
- Psychological services
- Psychiatric care
- Developmental assessments
- Behavioral health services

unless otherwise prohibited by law.

Initial here if applicable: ________

---

# EXPIRATION

This authorization shall remain valid until:

☐ One year from signature date

☐ Completion of consulting services

☐ Specific date: **{{expiration_specific_date}}**

☐ Other event: **{{expiration_other_event}}**

---

# SIGNATURES

## Patient / Student (if age 18 or older)

Signature: __________________________________________

Printed Name: __________________________________________

Date: __________________________________________

---

## Parent / Legal Guardian (if applicable)

Signature: __________________________________________

Printed Name: __________________________________________

Relationship: __________________________________________

Date: __________________________________________

---

## Witness (Optional)

Signature: __________________________________________

Printed Name: __________________________________________

Date: __________________________________________
$$
);
"""
