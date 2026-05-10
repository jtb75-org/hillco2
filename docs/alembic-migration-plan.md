# Alembic migration plan

Status: **design — no code yet**. This doc proposes the cutover from the
single-file `schema.sql` + idempotency-gated bootstrap Job to Alembic-managed
migrations, and lays out the open questions worth answering before we touch
the running cluster.

## Why we need this

`schema.sql` is fine for first-install but has no story for anything after
that. The schema-bootstrap Job at `~/repo/hillco2-gitops/base/schema-job.yaml`
explicitly skips re-applying once the `families` table exists:

```bash
if "${PSQL[@]}" -tAc "SELECT 1 FROM pg_tables WHERE tablename = 'families'" \
     | grep -q 1; then
  echo "Schema already present; skipping schema.sql."
```

So a change to `schema.sql` after first deploy is **silently a no-op** in
the cluster. We've already taken on five schema deltas (`catalog_phases`,
`autism_level`, `current_school_id` FK, `engagement_requirements`,
`learning_profiles`) and a hardening pass on the audit functions; the next
delta needs a real migration mechanism, not a re-run of the bootstrap.

veki's review (#5) flagged this as the biggest single architectural sharp
edge. This plan is the response.

## Tool decision: Alembic

We're keeping Alembic — Python-native, fits the FastAPI stack, mature,
ships with the Python ecosystem we already pin. The main limitation
(no autogenerate without SQLAlchemy models) doesn't bite us here because
`schema.sql` is hand-written raw SQL and we'd be writing migrations by
hand regardless. Alembic gives us:

- versioned, ordered, append-only migration files
- a `alembic_version` tracking table managed by the tool
- `alembic upgrade head` is idempotent — only applies missing revisions
- `alembic stamp <rev>` lets us mark an existing populated DB as already
  at a given revision (key for the live-cluster cutover; see below)
- `alembic downgrade` for emergencies, with hand-written downgrade SQL

**Things we are NOT doing:**

- Adopting SQLAlchemy ORM. Routes still use asyncpg with raw SQL.
- Using `alembic revision --autogenerate`. Without ORM models there's
  nothing to compare against; every migration is hand-written.
- Mixing migrations and seed data. Catalog seed (`seed_catalog.sql`)
  stays a separate idempotency-gated step — schema and seed have
  different update semantics.

**Alternatives considered, briefly:** dbmate (simpler, just runs ordered
SQL — ruled out only because Alembic is the team's existing language);
sqitch (more featureful with deploy/verify/revert — overkill for the
size of this app); ordered SQL files via psql with a custom version
table (we'd be reinventing Alembic poorly).

## Repo layout

```
hillco2/
  alembic.ini                  # Alembic config; reads DATABASE_URL from env
  alembic/
    env.py                     # connects via asyncpg, runs migrations
    script.py.mako             # template for new migrations
    versions/
      0001_baseline.py         # captures the current state of schema.sql verbatim
      0002_<next>.py           # new migration when the schema next changes
  schema.sql                   # DELETED — alembic owns schema state
  seed_catalog.sql             # KEPT — separate seed step
  .snapshot/                   # unchanged
```

The migrations are committed to the same repo as the app, mirrored into
`hillco2-gitops/alembic/` the same way `schema.sql` is mirrored today
(or the bootstrap Job pulls the migrations from a sidecar/initContainer
that mounts an emptyDir from the app image — see "Schema-bootstrap Job"
below).

`requirements.txt` adds `alembic>=1.14`. The app itself doesn't import
alembic — only the bootstrap Job does — but having it in the runtime
image lets us reuse the existing image and avoids a sidecar.

## Initial migration: capturing today's schema

`alembic/versions/0001_baseline.py` is one large migration whose `upgrade()`
runs the same SQL `schema.sql` runs today. Two ways to write it:

1. `op.execute(open(...).read())` — pulls the literal `schema.sql`
   contents at runtime. Pros: no duplication. Cons: requires the file
   to be packaged with the migration; brittle if the file moves.
2. Inline the SQL directly in `0001_baseline.py`. Pros: self-contained.
   Cons: ~500 lines of triple-quoted SQL.

**Recommendation: option 2.** Each migration should be self-contained
so a `git checkout` to any revision still applies cleanly. We replace
`schema.sql` with the migration; there's no duplication after that.

`downgrade()` for the baseline drops everything — `DROP SCHEMA public
CASCADE; CREATE SCHEMA public;` — explicitly destructive. Reasonable
for a baseline; you only downgrade past 0001 if you're tearing the DB
down anyway.

## Cutover plan for the live cluster

The hard part. The existing `hillco2` DB is already at the equivalent
of "0001 applied" (`families` exists, audit functions are search_path-
pinned, etc.) but has no `alembic_version` table. Three options:

### Option A: stamp + redeploy (recommended)

1. Land the migration code in the app + image; image now contains
   alembic + the baseline migration.
2. Run a one-time `alembic stamp 0001_baseline` against the live DB
   (kubectl exec into the schema-bootstrap pod, or a one-off Job).
   This creates `alembic_version` set to `0001_baseline` without
   running any DDL.
3. Update the schema-bootstrap Job to run `alembic upgrade head`
   instead of `psql -f schema.sql`. From then on, future deploys just
   apply newer revisions.

Pros: existing data untouched; reversible (we can re-stamp); the live
DB is in alembic-managed state from day one.

Cons: one manual step. We can semi-automate by having the bootstrap
Job *itself* stamp on first run if the schema looks present and
`alembic_version` doesn't exist (basically the existing families gate,
re-purposed).

### Option B: rebuild from snapshot

1. Take a CNPG backup snapshot of the live DB (we have those now).
2. Rebuild the cluster fresh: alembic upgrade head from scratch +
   replay `seed_catalog.sql` + replay `.snapshot/hillco-data.sql`.
3. Cut over.

Pros: cleanest end state; proves the migration path end-to-end.
Cons: brief downtime; fragile if the snapshot replay surfaces another
bug like the audit_trigger search_path issue did.

### Option C: write a "0001_baseline" that's idempotent

`upgrade()` checks for `families` and bails if present; otherwise applies
the schema. Then stamps automatically.

Pros: zero manual steps.
Cons: every future migration would need similar idempotency; you've
re-invented the bootstrap Job's gating in Python. Defeats the point.

**Recommendation: A.** Run `alembic stamp` once via a one-shot Job, then
hand the keys to the bootstrap Job.

## Schema-bootstrap Job changes

Today (`base/schema-job.yaml`):

```bash
PSQL=(psql -v ON_ERROR_STOP=1 ...)
if family_present; then skip; else psql -f /schema/schema.sql; fi
if items_present; then skip; else psql -f /schema/seed_catalog.sql; fi
```

After:

```bash
# alembic_version table tracks what's applied; alembic itself decides
# whether to skip (no migration needed) or apply.
alembic -c /app/alembic.ini upgrade head

# Catalog seed is still a separate idempotent gate — schema and seed
# have different update semantics, and re-running seed on a populated
# catalog would create duplicates.
ITEM_COUNT=$(psql -tAc "SELECT COUNT(*) FROM service_items")
if [ "${ITEM_COUNT}" -gt 0 ]; then
  echo "Catalog already seeded; skipping seed_catalog.sql."
else
  psql -f /seed/seed_catalog.sql
fi
```

Image-wise: the bootstrap Job currently runs the upstream CNPG postgres
image (`ghcr.io/cloudnative-pg/postgresql:16.4`) which has psql but
not python/alembic. Two options:

1. **Run alembic from the hillco2 web image.** It already has
   alembic-the-pip-dep (after we add it to `requirements.txt`) and
   `app/` is on the path. The Job mounts the same configMap-backed
   `seed_catalog.sql` and runs `alembic upgrade head` directly. This
   is the cleanest — single source of truth, no double-mirror.
2. Build a tiny dedicated migration image. Overkill for our size.

**Recommendation: 1.** Job uses `image: zot.lan.ng20.org/hillco2:<tag>`
and runs `alembic upgrade head` as its command. No more
configMapGenerator for `schema.sql` (it's gone); only `seed_catalog.sql`
stays in a configMap.

## Local dev workflow

After the cutover, schema changes look like:

```bash
# from the hillco2 repo root
alembic revision -m "add foo column to engagements"
# edit alembic/versions/<new>.py, write upgrade() and downgrade()
alembic upgrade head        # apply locally
# run tests
pytest                       # tests fixture re-applies from migrations
git commit -m "..."
git push
# CI builds the image; bootstrap Job picks up `alembic upgrade head`
# on next sync and applies the new revision.
```

Tests (`tests/conftest.py` `applied_schema` fixture) drop+recreate
public schema, then run `alembic upgrade head` instead of executing
schema.sql directly. The `seed_catalog.sql` step is unchanged.

## Test plan

- **Migration round-trip**: `alembic upgrade head` then `alembic
  downgrade base` then `alembic upgrade head` against a fresh DB. Every
  migration's downgrade is exercised.
- **Stamp scenario**: replay against an existing live-shaped DB
  (e.g. `.snapshot/hillco-data.sql`-loaded), `alembic stamp head`,
  confirm `alembic upgrade head` is a no-op.
- **CI gate**: add a pytest test that just runs `alembic upgrade head`
  against the test DB and asserts the schema has the expected tables /
  the audit functions still have their search_path pin.

## Decisions

The four open questions discussed above, resolved:

1. **`alembic.ini` location + `DATABASE_URL`.** `alembic.ini` at repo
   root, `sqlalchemy.url` left empty there, set programmatically in
   `alembic/env.py` from `os.environ["DATABASE_URL"]`. Same pattern as
   `app/config.py`; configparser's `%(VAR)s` interpolation is more
   fragile and harder to debug.
2. **`schema.sql` after cutover.** Deleted. The baseline migration is
   the canonical schema; "show me the schema" is served by `alembic
   upgrade head` against a scratch DB and `pg_dump --schema-only`. PR
   #2 leaves schema.sql in place (additive); PR #3 removes it as part
   of the cutover.
3. **Driver.** `psycopg[binary]>=3.2` for alembic. Async alembic adds
   complexity for no benefit at our scale (migrations run once per
   deploy, not per request). asyncpg stays for the app's request
   handlers.
4. **Catalog seed.** Stays as `seed_catalog.sql` with the separate
   `service_items count = 0` gate. Schema and seed have different
   update cadences and rollback semantics — a schema rollback shouldn't
   take seed data with it. Alembic data migrations are reserved for
   one-off transforms (e.g., "rename `iep` note kinds to `iep_review`
   to match a new enum value"), not ongoing seed reconciliation.

(Originally listed a fifth question about pre-migration backups via a
ScheduledBackup Sync hook; the daily CNPG backup already covers risk
at this scale, defer until a destructive migration actually needs the
safety net.)

## Proposed sequencing

1. **This PR**: design doc only (this file). No image / DB changes.
   Discuss + decide on the open questions.
2. **PR #2**: add `alembic/`, `0001_baseline.py`, the test that runs
   `alembic upgrade head`. Don't ship to cluster yet — verify the
   migration is byte-identical to `schema.sql` (compare `pg_dump
   --schema-only` output of a fresh DB built each way).
3. **PR #3**: stamp the live DB, swap the schema-bootstrap Job to run
   `alembic upgrade head`, delete `schema.sql`. This is the cutover.
4. **PR #4**: first real migration on top of alembic-managed schema
   (any future schema delta).

The cutover (#3) is the only step with operational risk; #2 is purely
additive and safe to land on its own.
