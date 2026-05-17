"""Reset the browser E2E database and seed catalog data.

This intentionally mirrors the pytest integration fixture: drop the public
schema, run Alembic to head, then apply seed_catalog.sql.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import asyncpg
from alembic.config import Config

from alembic import command

REPO_ROOT = Path(__file__).resolve().parent.parent
E2E_USER_EMAIL = "browser-e2e@example.com"
E2E_USER_NAME = "Browser E2E"
E2E_HOUSEHOLD = "E2E Golden Household"
E2E_CONTRACT_HOUSEHOLD = "E2E Contract Household"
E2E_STUDENT_FIRST = "Golden"
E2E_STUDENT_LAST = "Student"
E2E_CONTRACT_STUDENT_FIRST = "Contract"
E2E_CONTRACT_STUDENT_LAST = "Student"
E2E_ACTIVITY_TITLE = "E2E status selection activity"
E2E_SCHOOL_NAME = "E2E Test Academy"
LOCAL_OBJECT_STORE = Path(tempfile.gettempdir()) / "hillco2-local-object-store"


def _database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("TEST_DATABASE_URL or DATABASE_URL is required")

    parsed = urlparse(url)
    db_name = parsed.path.rsplit("/", 1)[-1]
    if parsed.hostname not in {"localhost", "127.0.0.1", "postgres"}:
        raise SystemExit(f"Refusing to reset non-local E2E database: {parsed.hostname}")
    if not db_name.endswith("_test"):
        raise SystemExit(f"Refusing to reset non-test database: {db_name}")
    return url


def _alembic_config() -> Config:
    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "alembic"))
    return cfg


async def _seed_user(conn: asyncpg.Connection) -> UUID:
    first, _, last = E2E_USER_NAME.partition(" ")
    user_id = await conn.fetchval(
        """
        INSERT INTO people (kind, first_name, last_name, email)
        VALUES ('other', $1, $2, $3)
        RETURNING id
        """,
        first,
        last or None,
        E2E_USER_EMAIL,
    )
    await conn.execute(
        """
        INSERT INTO auth (person_id, status, app_role)
        VALUES ($1, 'active', 'admin')
        """,
        user_id,
    )
    await conn.execute(
        """
        INSERT INTO auth_identities (person_id, provider, provider_subject)
        VALUES ($1, 'google', $2)
        """,
        user_id,
        E2E_USER_EMAIL,
    )
    return user_id


async def _seed_golden_path(conn: asyncpg.Connection) -> None:
    """Seed one deterministic engagement for browser story tests."""
    user_id = await _seed_user(conn)
    await conn.execute("SELECT set_config('app.user_id', $1, true)", str(user_id))

    # Firm settings: populate so the New Agreement dialog's
    # auto-fill resolves the firm-wide variables (governing_state,
    # billing_increment_minutes, etc.) and only agreement-override
    # variables remain in the missing list.
    await conn.execute(
        """
        UPDATE org_settings SET
          firm_name = $1,
          firm_street1 = $2,
          firm_city = $3,
          firm_state = $4,
          firm_postal_code = $5,
          governing_state = $6,
          billing_increment_minutes = $7,
          invoice_frequency = $8,
          payment_terms_days = $9,
          expense_approval_threshold = $10
        WHERE id = 1
        """,
        "E2E Educational Consulting",
        "1 Main St",
        "Indianapolis",
        "IN",
        "46202",
        "Indiana",
        15,
        "monthly",
        30,
        "250.00",
    )

    family_id = await conn.fetchval(
        "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
        E2E_HOUSEHOLD,
    )
    student_id = await conn.fetchval(
        """
        INSERT INTO people (kind, first_name, last_name)
        VALUES ('student', $1, $2)
        RETURNING id
        """,
        E2E_STUDENT_FIRST,
        E2E_STUDENT_LAST,
    )
    await conn.execute(
        "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
        family_id,
        student_id,
    )
    await conn.execute(
        "INSERT INTO student_details (person_id, current_grade) VALUES ($1, '10')",
        student_id,
    )
    engagement_id = await conn.fetchval(
        """
        INSERT INTO engagements (
          family_id, student_id, engagement_type, status, start_date,
          default_hourly_rate, lead_consultant_id
        ) VALUES ($1, $2, 'assessment', 'in_progress', CURRENT_DATE, 175.00, $3)
        RETURNING id
        """,
        family_id,
        student_id,
        user_id,
    )
    await conn.execute(
        """
        INSERT INTO agreements (engagement_id, type, status, amount, notes, created_by)
        VALUES ($1, 'services_contract', 'draft', 2500.00, 'Seeded E2E draft', $2)
        """,
        engagement_id,
        user_id,
    )
    await conn.execute(
        """
        INSERT INTO engagement_tasks (
          engagement_id, title, description, status, billable, sort_order,
          created_by, activity_kind, structured_content
        ) VALUES (
          $1, $2, 'Seeded activity for status selection', 'not_started',
          true, 10, $3, 'task', '{}'::jsonb
        )
        """,
        engagement_id,
        E2E_ACTIVITY_TITLE,
        user_id,
    )
    await conn.execute(
        """
        INSERT INTO schools (
          name, location, school_type, grade_range_low, grade_range_high,
          website, fit_profile, notes
        ) VALUES (
          $1, 'Testville, TX', 'Independent', '6', '12',
          'https://example.test/e2e-academy',
          'Seeded school for duplicate recommendation E2E coverage.',
          'Created by reset_e2e_db.py'
        )
        """,
        E2E_SCHOOL_NAME,
    )
    contract_family_id = await conn.fetchval(
        "INSERT INTO families (household_name) VALUES ($1) RETURNING id",
        E2E_CONTRACT_HOUSEHOLD,
    )
    contract_student_id = await conn.fetchval(
        """
        INSERT INTO people (kind, first_name, last_name)
        VALUES ('student', $1, $2)
        RETURNING id
        """,
        E2E_CONTRACT_STUDENT_FIRST,
        E2E_CONTRACT_STUDENT_LAST,
    )
    await conn.execute(
        "INSERT INTO family_students (family_id, person_id) VALUES ($1, $2)",
        contract_family_id,
        contract_student_id,
    )
    await conn.execute(
        "INSERT INTO student_details (person_id, current_grade) VALUES ($1, '9')",
        contract_student_id,
    )
    await conn.execute(
        """
        INSERT INTO engagements (
          family_id, student_id, engagement_type, status, start_date,
          default_hourly_rate, lead_consultant_id
        ) VALUES ($1, $2, 'assessment', 'in_progress', CURRENT_DATE, 175.00, $3)
        """,
        contract_family_id,
        contract_student_id,
        user_id,
    )


async def main() -> None:
    url = _database_url()
    os.environ["DATABASE_URL"] = url
    shutil.rmtree(LOCAL_OBJECT_STORE, ignore_errors=True)

    conn = await asyncpg.connect(url)
    try:
        await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    finally:
        await conn.close()

    await asyncio.to_thread(command.upgrade, _alembic_config(), "head")

    conn = await asyncpg.connect(url)
    try:
        await conn.execute((REPO_ROOT / "seed_catalog.sql").read_text())
        await _seed_golden_path(conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
