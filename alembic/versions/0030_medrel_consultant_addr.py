"""collapse the consultant address block in the medical-release template

consultant_address is rendered as a full single-line address (street, city,
state ZIP) — the same value the services contract uses. The medical-release
template additionally had a separate "City/State/Zip: {{consultant_city_state_zip}}"
line, which would duplicate the tail of consultant_address (and otherwise sit
empty). Remove that consultant line. The patient's City/State/Zip line is left
intact — patient_address / patient_city_state_zip are now sourced separately
from the guardian.

Revision ID: 0030_medrel_consultant_addr
Revises: 0029_agreement_esign
Create Date: 2026-09-13
"""
from alembic import op

revision: str = "0030_medrel_consultant_addr"
down_revision = "0029_agreement_esign"
branch_labels = None
depends_on = None


OLD = "Address: **{{consultant_address}}**\n\nCity/State/Zip: **{{consultant_city_state_zip}}**"
NEW = "Address: **{{consultant_address}}**"


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
