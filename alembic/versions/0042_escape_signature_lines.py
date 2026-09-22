"""escape the templates' wet-ink signature lines so they render as lines

The templates draw initials / signature / date lines as runs of underscores
(`Name: _______________`). python-markdown reads a bare run as emphasis
markers and renders `<strong><em>_</em></strong>__` — a stub of a line with
stray bold-italic — instead of a full-length rule. Escaping each underscore
(`\\_`) makes it literal, which is exactly what the rich editor emits when a
template is saved from it. Applied to every run of three or more
underscores in every template; `{{snake_case}}` placeholders are untouched
(single underscores).

Revision ID: 0042_escape_signature_lines
Revises: 0041_records_request
Create Date: 2026-09-21
"""
import re

import sqlalchemy as sa

from alembic import op

revision: str = "0042_escape_signature_lines"
down_revision = "0041_records_request"
branch_labels = None
depends_on = None

RUN = re.compile(r"(?<!\\)_{3,}")


def _escape(body: str) -> str:
    return RUN.sub(lambda m: "\\_" * len(m.group()), body)


def _unescape(body: str) -> str:
    return re.sub(r"(?:\\_){3,}", lambda m: "_" * (len(m.group()) // 2), body)


def _rewrite(transform) -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, body_markdown FROM contract_templates WHERE deleted_at IS NULL")
    ).fetchall()
    for tid, body in rows:
        new = transform(body or "")
        if new != body:
            bind.execute(
                sa.text("UPDATE contract_templates SET body_markdown = :b WHERE id = :id"),
                {"b": new, "id": tid},
            )


def upgrade() -> None:
    _rewrite(_escape)


def downgrade() -> None:
    _rewrite(_unescape)
