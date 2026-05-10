from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def image_alembic_head() -> str | None:
    """Alembic head revision baked into this image's `alembic/versions/`.

    Used by the admin /about endpoint to compare against the live DB's
    `alembic_version`. A mismatch means the running image expects a
    schema the DB hasn't migrated to (or vice versa) — usually because
    a deploy rolled before the migration Job finished, or because
    someone restored a backup that's stamped behind the image.

    Returns None if alembic isn't importable or the config can't be
    located (dev environments may not have either).
    """
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
    except ImportError:
        return None

    # In the container, alembic.ini is at /app/alembic.ini and uvicorn
    # runs with cwd=/app. In dev/test, repo root contains alembic.ini.
    candidates = [
        Path("alembic.ini"),
        Path(__file__).resolve().parent.parent / "alembic.ini",
    ]
    cfg_path = next((p for p in candidates if p.exists()), None)
    if cfg_path is None:
        return None
    try:
        cfg = Config(str(cfg_path))
        return ScriptDirectory.from_config(cfg).get_current_head()
    except Exception:
        return None


async def db_alembic_revision(conn) -> str | None:
    """Read `alembic_version.version_num` from the live DB.

    Returns None if the table doesn't exist (fresh DB pre-stamp) or the
    row is missing.
    """
    try:
        return await conn.fetchval("SELECT version_num FROM alembic_version LIMIT 1")
    except Exception:
        return None
