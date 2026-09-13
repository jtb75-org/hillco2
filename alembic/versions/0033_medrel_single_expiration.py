"""collapse the medical-release expiration checkboxes into one signer choice

The four ballot-box options rendered as never-tickable checkboxes, and nothing
stopped the signer filling more than one. Replace the block with a single
{{expiration}} line; the signer picks exactly one option on the signing page and
it renders as one clean line ("Specific date: 2027-09-13", etc.).

Revision ID: 0033_medrel_single_expiration
Revises: 0032_esign_cut_marker
Create Date: 2026-09-13
"""
from alembic import op

revision: str = "0033_medrel_single_expiration"
down_revision = "0032_esign_cut_marker"
branch_labels = None
depends_on = None

_BOX = "☐"  # ballot box

OLD = (
    "This authorization shall remain valid until:\n\n"
    f"{_BOX} One year from signature date\n\n"
    f"{_BOX} Completion of consulting services\n\n"
    f"{_BOX} Specific date: **{{{{expiration_specific_date}}}}**\n\n"
    f"{_BOX} Other event: **{{{{expiration_other_event}}}}**"
)
NEW = "This authorization shall remain valid until: **{{expiration}}**"


def _swap(a: str, b: str) -> None:
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $old${a}$old$, $new${b}$new$) "
        "WHERE kind = 'medical_release'"
    )


def upgrade() -> None:
    _swap(OLD, NEW)


def downgrade() -> None:
    _swap(NEW, OLD)
