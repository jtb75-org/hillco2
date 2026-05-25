"""Dump the FastAPI app's OpenAPI spec to spa/openapi.json.

Used by `npm run update-openapi` so codegen doesn't depend on a running
backend (production has docs disabled via Settings.expose_docs; curling
prod returns 404). Importing app.main pulls in Settings(), which needs
env vars to satisfy required fields — we stub the minimum here.

Run:
    python3 scripts/dump_openapi.py

Or via the SPA workflow:
    cd spa && npm run update-openapi
"""
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Stub the required Settings fields before importing app.main. Values are
# placeholders — nothing in this script makes a DB connection or OAuth
# round-trip; the FastAPI app's lifespan (which would create the asyncpg
# pool) does not run on bare module import.
os.environ.setdefault("DATABASE_URL", "postgresql://stub@localhost:5432/stub")
os.environ.setdefault("SESSION_SECRET", "openapi-dump-stub-not-for-runtime-use")
os.environ.setdefault("GOOGLE_CLIENT_ID", "stub.apps.googleusercontent.com")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "stub")

sys.path.insert(0, str(REPO_ROOT))

from app.main import app  # noqa: E402

OUT = REPO_ROOT / "spa" / "openapi.json"
OUT.write_text(json.dumps(app.openapi(), indent=2) + "\n")
print(f"wrote {OUT.relative_to(REPO_ROOT)}")
