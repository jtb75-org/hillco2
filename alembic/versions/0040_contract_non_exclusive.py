"""§12 INDEPENDENT CONTRACTOR: non-exclusive engagement and availability

Append two paragraphs to §12 in both services contracts: the engagement is
non-exclusive (Consultant may serve other clients and allocate time among
other activities, provided that doesn't materially interfere with the
Services, and owes Client no full-time or exclusive attention), and unless
agreed otherwise in writing Consultant doesn't guarantee availability at
any particular time or outside normal business availability.

Also repairs a seed defect found while matching §12: the fixed-fee
template carried three doubled apostrophes (`Consultant''s` in §10, §12
and §14 — SQL escaping that leaked into the stored text and into every
rendered PDF). They're collapsed to a single apostrophe first so the §12
anchor matches; the hourly and medical-release templates never had them.

The append is guarded on the new text being absent, so it cannot apply
twice, and it's a no-op on an operator-edited §12.

Revision ID: 0040_contract_non_exclusive
Revises: 0039_contract_completion_def
Create Date: 2026-09-20
"""
from alembic import op

revision: str = "0040_contract_non_exclusive"
down_revision = "0039_contract_completion_def"
branch_labels = None
depends_on = None


OLD = """# 12. INDEPENDENT CONTRACTOR

Consultant is an independent contractor and not an employee, agent, or representative of Client.

Consultant shall be solely responsible for taxes, insurance, and other obligations arising from Consultant's business operations."""

ADDED = """

This engagement is non-exclusive. Consultant may provide services to other clients and may allocate Consultant's time and resources among other professional and business activities, provided that doing so does not materially interfere with Consultant's performance of the Services under this Agreement. Nothing in this Agreement requires Consultant to devote Consultant's full time or exclusive attention to Client.

Unless expressly agreed otherwise in writing, Consultant does not guarantee availability at any particular time or on any particular day and is not required to provide Services outside Consultant's normal business availability."""

NEW = OLD + ADDED

# Only the fixed-fee contract carries {{fixed_fee}} (0028 removed it from the
# hourly one).
_FIXED_ONLY = "position('{{fixed_fee}}' in body_markdown) > 0"
_NOT_YET_ADDED = "position('This engagement is non-exclusive' in body_markdown) = 0"


def upgrade() -> None:
    # 1. Collapse the fixed-fee seed's doubled apostrophes (`''` -> `'`).
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        "replace(body_markdown, $q$''$q$, $q$'$q$) "
        f"WHERE kind = 'services_contract' AND {_FIXED_ONLY}"
    )
    # 2. Append the two paragraphs, once.
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $old${OLD}$old$, $new${NEW}$new$) "
        f"WHERE kind = 'services_contract' AND {_NOT_YET_ADDED}"
    )


def downgrade() -> None:
    # The apostrophe repair is a typo fix and is deliberately not reverted.
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $new${NEW}$new$, $old${OLD}$old$) "
        "WHERE kind = 'services_contract'"
    )
