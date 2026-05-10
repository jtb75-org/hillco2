# Snapshot of hillco-portal live DB

Captured 2026-05-09 from CNPG cluster `hillco-portal-pg` in namespace `hillco-portal`. Test data only — fine to commit.

## Files

- `hillco-data.sql` — `pg_dump --data-only --inserts --column-inserts` of all tables we plan to migrate to hillco2. 87 INSERTs across 15 tables. Excluded: `audit_log` (history), `service_items` + `service_item_engagement_types` (catalog rebuilds in hillco2), `engagement_tasks` (empty), `invoice_sequence` (regenerates).
- `students-transformed.sql` — three rewritten student INSERTs that hillco-data.sql gets patched against (rename `current_school` → `current_school_id`, `has_autism` → `autism_level`; both NULL because no autism diagnoses and no school name matches).
- `build_replay.py` — emits a transactionally-wrapped replay file that strips the dump's `set_config('search_path','')` line, swaps the three student INSERTs in place, and wraps everything in BEGIN/COMMIT. Run as: `python3 build_replay.py > /tmp/replay.sql`.

## Replay status

Replayed cleanly into the live `hillco2-pg` cluster on 2026-05-09. Counts match the snapshot exactly.

## Row counts

| table | rows |
|---|---|
| schools | 34 |
| time_entries | 9 |
| invoice_line_items | 7 |
| followups | 6 |
| users | 5 |
| notes | 4 |
| students | 3 |
| school_recommendations | 3 |
| parents | 3 |
| expenses | 3 |
| engagements | 3 |
| engagement_students | 3 |
| school_visits | 2 |
| invoices | 2 |
| families | 2 |

## Transform rules for hillco2 schema

Three tables have schema deltas. When this snapshot is replayed into hillco2, these transforms apply:

### `students.has_autism BOOLEAN` → `autism_level SMALLINT NULL`
- Every row in the snapshot has `has_autism=false`. Transform: drop the column, all rows get `autism_level=NULL`.

### `students.current_school TEXT` → `current_school_id UUID NULL` (FK to schools)
- 3 students have `current_school` text values: `Lindbergh Middle`, `Lindbergh Elementary`, `Brentwood Middle`.
- None of these match any name in the live `schools` table (case-insensitive trimmed compare).
- Transform: all 3 students get `current_school_id=NULL`. Original text is captured here for reference; if you want to preserve it, add those 3 schools to `schools` and re-run the FK lookup.

### `engagements` adds `engagement_type` column
- 3 engagements; **all assessment** (confirmed 2026-05-09):
  - `21523ebd-83bb-430a-b7b2-59b3c091cc64` — Smith family, start 2026-03-15 → `assessment`
  - `ea5cdb44-1f44-4aa9-ab32-561ae3fdab78` — Jones family, start 2026-04-20 → `assessment`
  - `d8f0af5f-d428-4832-9bc6-550f4fac637b` — Smith family, no start date → `assessment`

## Excluded from snapshot

- `audit_log` (386 rows) — old app's audit trail; not useful in hillco2.
- `service_items` (39) + `service_item_engagement_types` (54) — catalog is being rebuilt around the redesign doc's phase/scope structure. The hillco2 `catalog_phases` + `service_items` seed is independent of these.
- `engagement_tasks` (0) — empty.
- `invoice_sequence` (1) — regenerates from `next_invoice_number()` on first invoice.
- `communications`, `contacts`, `documents`, `reports`, `school_visit_attendees` — all empty in live DB.
