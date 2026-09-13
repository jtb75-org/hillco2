"""dynamic scope-of-services in the services contract templates

Replace the static "Representative Services" bullet list (identical in both
the hourly and fixed services-contract templates) with a Scope of Services
section that pulls the engagement's actual activities at agreement-creation
time via the {{scope_of_services}} variable. Non-destructive: a template that
doesn't contain the exact block (e.g. an operator-edited one) is left alone.

Revision ID: 0027_contract_scope_variable
Revises: 0026_seed_fixed_bid_template
Create Date: 2026-09-12
"""
from alembic import op

revision: str = "0027_contract_scope_variable"
down_revision = "0026_seed_fixed_bid_template"
branch_labels = None
depends_on = None


OLD_BLOCK = """## Representative Services

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
- Other educational consulting services mutually agreed upon by the Parties"""

NEW_BLOCK = """## Scope of Services

The following services are included in this engagement:

{{scope_of_services}}"""


def _swap(a: str, b: str) -> None:
    # Dollar-quoted literals with no surrounding whitespace so the replace
    # matches the block exactly.
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $old${a}$old$, $new${b}$new$) "
        "WHERE kind = 'services_contract'"
    )


def upgrade() -> None:
    _swap(OLD_BLOCK, NEW_BLOCK)


def downgrade() -> None:
    _swap(NEW_BLOCK, OLD_BLOCK)
