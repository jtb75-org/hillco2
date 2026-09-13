"""drop {{hourly_rate}} from the fixed-fee services contract

The fixed-fee template referenced {{hourly_rate}} in its out-of-scope clause,
which made "Hourly Rate" a required variable on a fixed-fee contract even
though a fixed engagement has no hourly rate. Reword the clause so additional
work is billed "at an hourly rate to be mutually agreed upon in writing",
removing the placeholder. Scoped to billing_mode='fixed' so the hourly
(Standard) template — which legitimately uses {{hourly_rate}} — is untouched.
Non-destructive: a body without the exact clause is left alone.

Revision ID: 0028_fixed_template_drop_hourly
Revises: 0027_contract_scope_variable
Create Date: 2026-09-13
"""
from alembic import op

revision: str = "0028_fixed_template_drop_hourly"
down_revision = "0027_contract_scope_variable"
branch_labels = None
depends_on = None


OLD = (
    "either as an additional fixed fee or at an hourly rate of "
    "**${{hourly_rate}} per hour**, as mutually agreed."
)
NEW = (
    "either as an additional fixed fee or at an hourly rate to be "
    "mutually agreed upon in writing."
)


def _swap(a: str, b: str) -> None:
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $old${a}$old$, $new${b}$new$) "
        "WHERE kind = 'services_contract' AND billing_mode = 'fixed'"
    )


def upgrade() -> None:
    _swap(OLD, NEW)


def downgrade() -> None:
    _swap(NEW, OLD)
