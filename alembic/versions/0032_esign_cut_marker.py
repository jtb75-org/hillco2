"""mark the wet-ink signature block so e-signed copies can drop it

An e-signed agreement carries a Signature Certificate page with the captured
electronic signatures, so the template's manual "Signature: ____ / Date: ____"
block is redundant on those copies. Insert an <!-- esign-cut --> marker right
before each template's signature section; the renderer trims everything from the
marker down when producing an e-signed copy (unsigned drafts, which may still be
printed for a wet signature, keep it — the marker is an invisible HTML comment).

Revision ID: 0032_esign_cut_marker
Revises: 0031_org_firm_phone
Create Date: 2026-09-13
"""
from alembic import op

revision: str = "0032_esign_cut_marker"
down_revision = "0031_org_firm_phone"
branch_labels = None
depends_on = None

MARKER = "<!-- esign-cut -->"

# (kind, heading that starts the wet-signature block)
_HEADINGS = [
    ("medical_release", "# SIGNATURES"),
    ("services_contract", "# 18. SIGNATURES"),
]


def _swap(kind: str, old: str, new: str) -> None:
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $old${old}$old$, $new${new}$new$) "
        f"WHERE kind = '{kind}'"
    )


def upgrade() -> None:
    for kind, heading in _HEADINGS:
        _swap(kind, heading, f"{MARKER}\n\n{heading}")


def downgrade() -> None:
    for kind, heading in _HEADINGS:
        _swap(kind, f"{MARKER}\n\n{heading}", heading)
