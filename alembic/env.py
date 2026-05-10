"""Alembic environment.

Reads DATABASE_URL from os.environ — same pattern app/config.py uses
for the runtime app — rather than configparser interpolation in
alembic.ini. Migrations are hand-written raw SQL via op.execute();
target_metadata stays None because we don't have SQLAlchemy ORM
models to autogenerate against.
"""
import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None  # raw-SQL migrations only; no autogenerate.

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set; alembic needs it to connect. "
        "In dev, export DATABASE_URL=postgresql://... ; in the cluster, "
        "the schema-bootstrap Job pulls it from the hillco2-pg-app secret."
    )

# Force the psycopg v3 driver. asyncpg is async-only and incompatible
# with alembic's sync runner; without this rewrite, SQLAlchemy would
# pick whatever postgres driver it finds first on PATH and we'd be at
# the mercy of the runtime environment.
if DATABASE_URL.startswith("postgresql://") and "+psycopg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://", "postgresql+psycopg://", 1
    )

config.set_main_option("sqlalchemy.url", DATABASE_URL)


def run_migrations_offline() -> None:
    """Render migrations as SQL without a connection — supports
    `alembic upgrade head --sql > rollout.sql` for inspection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
