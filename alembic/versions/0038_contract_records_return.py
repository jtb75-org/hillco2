"""§8: return of Client-furnished records on request, with retention carve-out

Immediately after the record-retention paragraph 0037 added to §8
CONFIDENTIALITY, add that on Client's written request after the engagement
Consultant returns original Client-furnished documents (and returns or
deletes other Client-furnished materials where practicable), while keeping
copies of records, communications, and Consultant's own work product for
business, legal, recordkeeping, and compliance purposes — and that anything
retained stays under the confidentiality obligations.

Shared §8: both services contracts carry the identical paragraph, so one
replace covers both. Non-destructive on an operator-edited §8.

Revision ID: 0038_contract_records_return
Revises: 0037_contract_sections_4_to_8
Create Date: 2026-09-20
"""
from alembic import op

revision: str = "0038_contract_records_return"
down_revision = "0037_contract_sections_4_to_8"
branch_labels = None
depends_on = None


RETENTION = """Consultant may retain Client records and communications for legitimate business, legal, recordkeeping, and compliance purposes following completion or termination of the engagement. Consultant may thereafter securely delete or destroy such records in accordance with Consultant's record-retention practices and applicable law."""

RETURN = """Upon Client's written request following completion or termination of the engagement, Consultant shall return any original documents furnished by Client and, to the extent reasonably practicable, return or securely delete other materials furnished by Client; provided, however, that Consultant may retain copies of Client records and communications, as well as Consultant's notes, analyses, recommendations, and other work product, for legitimate business, legal, recordkeeping, and compliance purposes and as required by applicable law.

Any retained information shall remain subject to the confidentiality obligations of this Agreement."""

OLD = RETENTION
NEW = RETENTION + "\n\n" + RETURN


def _swap(a: str, b: str) -> None:
    op.execute(
        "UPDATE contract_templates SET body_markdown = "
        f"replace(body_markdown, $old${a}$old$, $new${b}$new$) "
        "WHERE kind = 'services_contract'"
    )


def upgrade() -> None:
    _swap(OLD, NEW)


def downgrade() -> None:
    _swap(NEW, OLD)
