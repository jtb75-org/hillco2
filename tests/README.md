# tests

Integration suite over the real FastAPI app + a real Postgres. Covers the
"spooky parts" — schema/audit/auth boundaries, invoice state machine,
catalog scoping — not exhaustive per-route CRUD.

## Running locally

You need a Postgres on `TEST_DATABASE_URL`. The suite **drops and
recreates `public`** at session start, so don't aim it at a database
you care about.

The easiest path is the cluster's existing CNPG:

```bash
# create a scratch DB on the cluster
kubectl exec -n hillco2 hillco2-pg-1 -- psql -U postgres -c \
  "DROP DATABASE IF EXISTS hillco2_test; CREATE DATABASE hillco2_test;"

# port-forward
kubectl port-forward -n hillco2 svc/hillco2-pg-rw 15432:5432 >/dev/null &

# point env at it; postgres user uses peer auth in-pod, but over the
# port-forward we can use the postgres role directly without password
TEST_DATABASE_URL='postgresql://postgres@localhost:15432/hillco2_test' \
  pip install -r requirements-test.txt && pytest -v
```

For a fully local Postgres:

```bash
docker run -d --name hillco2-pg-test \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=hillco2_test \
  -p 5432:5432 ghcr.io/cloudnative-pg/postgresql:16.4

TEST_DATABASE_URL='postgresql://postgres:test@localhost:5432/hillco2_test' pytest -v
```

## What's covered

- `test_schema.py` — catalog seed counts, `audit_trigger` /
  `current_app_user_id` keep their `SET search_path` pin, the
  `engagement_financial_summary` view exists, the
  `(engagement_id, student_id)` unique index on `learning_profiles`
  is in place.
- `test_auth.py` — every `/api/*` route returns 401 without a session,
  `/health` doesn't, valid session returns the user on `/api/me`,
  bogus cookie is treated as anonymous.
- `test_audit.py` — INSERTs under `search_path=''` still attribute
  to `app.user_id` via the trigger (the bug we fixed in commit `0fd1563`).
- `test_invoices.py` — full lifecycle (draft → sent → paid), partial
  payment rejection, void releases the linked time entry, you can't
  delete a time entry that's on an invoice.
- `test_engagement_tasks.py` — assessment engagements only see
  assessment-scope phases in `/api/engagements/{id}/catalog`,
  full_placement sees both, bulk-from-catalog drops out-of-scope items,
  and is idempotent per `service_item_id`.

## What's NOT covered (by design)

- Per-route CRUD. The router infrastructure is uniform enough that one
  CRUD test per domain would mostly catch typos that ruff already gets.
- WeasyPrint PDF rendering. The output is binary; the renderer is
  an external library; the only thing that could regress on our side
  is template syntax, which fails fast at first call.
- S3 / MinIO uploads. Those need a live MinIO. Test in deploy.
- OAuth callback. Full Google OAuth dance can't be exercised
  in-process; the SessionMiddleware path that follows it is exercised
  by `test_auth.py`.
