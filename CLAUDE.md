# hillco2

Practice-management app for an education consulting / tutoring business — manages schools, students, families, contacts, engagements, intakes, agreements, invoices, expenses, learning profiles/supports, and scheduling.

> Stub — expand as conventions solidify. See `docs/` for plans and the migration notes.

## Stack

- **Backend**: Python 3.12, FastAPI (`fastapi[standard]`), **asyncpg** for queries, Pydantic settings
- **Migrations**: alembic + psycopg v3 (async app, sync migrations by design — see `requirements.txt` note)
- **Frontend**: `spa/` — Vite + React 18 + TypeScript (Playwright e2e); `landing/` static site
- **Auth**: Authlib (Google OIDC) + itsdangerous-signed sessions
- **Integrations**: Google Calendar (`app/google_calendar.py`), PDF generation via WeasyPrint (`app/pdf.py`), email (`app/email.py`), S3 via boto3
- **DB**: PostgreSQL 16
- **Deploy**: k3s + Argo CD (manifests in **`hillco2-gitops`**, auto-added to this session)

## Layout

```
app/
├── main.py            # FastAPI app, route registration
├── config.py, db.py   # settings + asyncpg pool
├── auth.py            # Google OIDC + session auth
├── google_calendar.py, pdf.py, email.py
├── migrations.py
└── routes/            # one module per resource:
    #  schools, students, families, people, contacts, engagements,
    #  engagement_tasks/types, intakes, agreements, contract_templates,
    #  invoices, expenses, time_entries, learning_profiles/supports,
    #  catalog, calendar, school_visits, followups, recommendations,
    #  documents, notes, dashboard, admin, org_settings, me, auth, health
alembic/               # migrations
spa/                   # React/TS frontend (openapi.json, playwright e2e)
landing/               # marketing/landing site
docs/plans/            # design + migration plans
seed_catalog.sql, seed_schools.sql
```

## Conventions

- Queries use **asyncpg directly** (not the ORM); alembic/SQLAlchemy is migrations-only
- `ruff` for lint/format (`ruff.toml`)
- pytest with `asyncio_mode = "auto"`; session-scoped event loop (see `pyproject.toml` for the why — pool connections must share the loop)

## Local Development

`Makefile` + `docker-compose.dev.yml` provide a one-command Postgres (host port **15434**, chosen to avoid colliding with silkstrand 15432/15433 and blue 5432). Requires a running Docker engine (OrbStack).

### Required env (no `.env.example` in repo — `app/config.py` is the source of truth)

```bash
# DATABASE_URL has a default baked into the Makefile; export it for direct
# alembic/fastapi runs outside make:
export DATABASE_URL=postgresql://hillco2:localdev@localhost:15434/hillco2
export SESSION_SECRET=dev-secret
export GOOGLE_CLIENT_ID=...        # required even in dev (OIDC login)
export GOOGLE_CLIENT_SECRET=...
export CORS_ALLOW_ORIGINS=http://localhost:5173   # let the Vite dev server call the API
# Optional: skip Google OIDC in dev/e2e by setting the bypass token
# export E2E_AUTH_BYPASS_TOKEN=... (sent in the x-hillco2-e2e-auth header)
```

### Backend (FastAPI)

```bash
pip install -r requirements.txt
make dev-deps        # start local Postgres (docker compose, detached)
make migrate         # alembic upgrade head (psycopg v3)
make seed            # optional: load seed_catalog.sql + seed_schools.sql
make dev-api         # fastapi dev app/main.py → http://127.0.0.1:8000
# stop deps:  make dev-deps-down   (data persists; -reset to wipe the volume)
```

### Frontend (`spa/`)

```bash
cd spa && npm install
npm run dev          # Vite dev server on :5173   (or `make dev-spa` from repo root)
npm run lint         # tsc --noEmit
npm run update-openapi  # regen openapi.json from the running API, then codegen schema.ts
```

The SPA is typed against `spa/openapi.json`; after changing API routes/models, run `npm run update-openapi` (needs the backend reachable — port-forward in prod, or local API in dev) so `src/api/schema.ts` stays in sync.

### Tests

```bash
pytest                          # backend (asyncio_mode=auto, session-scoped loop)
cd spa && npm run e2e           # Playwright e2e
python3 scripts/reset_e2e_db.py # rebuild the e2e DB: drop schema → alembic head → seed
```

## Deploy

Merge to `main` → CI builds/pushes images → bump tags in **`hillco2-gitops`** → Argo CD syncs.
The image's bootstrap Job runs `alembic -c /app/alembic.ini upgrade head` before the app starts.
