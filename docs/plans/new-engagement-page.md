# Plan v2: new engagement detail page

Status: **locked**. Folds in vera + halo review and Joe's
sign-off (1:1 task↔visit/rec; 409 on recommendation collision) on
2026-05-17. Mockup at `/mockup/engagement-detail` on branch
`mockup/engagement-detail`.

## Goal

Replace `/engagements/:id` with the workflow-shaped layout the mockup
demonstrates. The engagement covers the **paid** work after intake —
contract + records collection + catalog-driven activities (with bespoke
add-ons) + time + expenses. The intake's `intake_snapshot` (PR #107)
surfaces read-only at the top so the consultant carries the discovery
context into the engagement.

Sections in order:

1. Header (status / start / target / lead / hourly rate)
2. Intake context (read-only snapshot from `engagements.intake_snapshot`)
3. Contract & releases (services agreement + medical-records release)
4. Records needed (`engagement_requirements`)
5. Activities (catalog-driven + bespoke; cross-table for visits + recs)
6. Time entries (independent from activities)
7. Expenses
8. Engagement notes (rich-text catch-all)

## Non-goals

- **PDF generation for contracts.** Phase 1 ships the state machine
  (draft → sent → signed) with a draft agreement row that has no
  generated document; the consultant downloads a blank template and
  fills it manually. Phase 2 (deferred PR-Tail) wires real PDF
  rendering.
- **Invoicing.** Time + expenses surface invoice-lock state, but
  invoice creation/management lives elsewhere.
- **Engagement list redesign.** The list page stays on its current
  shape until this page lands.
- **Cross-table polymorphic SQL.** Frontend composes activities from
  three TanStack queries (tasks + visits + recommendations) and merges
  client-side, sorted by `sort_order` inherited from the linked task.
- **N:1 (multiple visits per activity).** Locked to 1:1 via partial
  unique indexes. If a future practice needs N:1, drop the index in a
  follow-up.

## Schema diff

Four migrations.

### `0010_engagement_activity_kind.py`

| table              | column                      | type                       | notes |
|--------------------|-----------------------------|----------------------------|-------|
| `engagement_tasks` | `activity_kind`             | TEXT, CHECK enum, default `'task'` | `task` / `document_review` / `best_environment` / `feedback_meeting` / `school_visit` / `school_recommendation`. Drives the type-specific UI body. |
| `engagement_tasks` | `structured_content`        | JSONB, default `'{}'`      | Shape varies by kind. Empty for `task` / `school_visit` / `school_recommendation` (latter two read from their own tables). For `best_environment`: `{curriculum, placement_size, social_emotional, extras}` (rich-text HTML strings). For `document_review`: `{educational_doc_ids: UUID[], medical_doc_ids: UUID[]}`. For `feedback_meeting`: `{recommendations, admissions, follow_on}`. |
| `service_items`    | `default_activity_kind`     | TEXT, CHECK enum, default `'task'` | Inherited onto `engagement_tasks.activity_kind` when seeded from this catalog item. |

Day-one backfill: upgrade the existing canonical catalog items
(document review, BEE, campus visit, feedback meeting) to their
proper `default_activity_kind` values. Per halo + vera both: don't
ship a catalog where every item still says `task` — UI loses its value.

### `0011_engagement_task_links.py`

| table                    | column                | type                                                                                              | notes |
|--------------------------|-----------------------|---------------------------------------------------------------------------------------------------|-------|
| `school_visits`          | `engagement_task_id`  | UUID, nullable, FK `engagement_tasks(id)` ON DELETE SET NULL                                      | Links to the activity row that orchestrates it. Pre-existing visits without a task stay valid. |
| `school_recommendations` | `engagement_task_id`  | UUID, nullable, FK `engagement_tasks(id)` ON DELETE SET NULL                                      | Same pattern. |

Plus two partial unique indexes locking in 1:1:

```sql
CREATE UNIQUE INDEX school_visits_engagement_task_unique
    ON school_visits (engagement_task_id)
    WHERE engagement_task_id IS NOT NULL;

CREATE UNIQUE INDEX school_recommendations_engagement_task_unique
    ON school_recommendations (engagement_task_id)
    WHERE engagement_task_id IS NOT NULL;
```

### `0012_agreements_sent_at.py`

| table        | column     | type           | notes |
|--------------|------------|----------------|-------|
| `agreements` | `sent_at`  | TIMESTAMPTZ    | Nullable. Stamped on `POST /api/agreements/{id}/mark-sent`. UI maps `(status='draft' AND sent_at IS NOT NULL)` to "Awaiting signature." No enum changes to the existing `status` (draft / active / superseded / expired / terminated). |

### `0013_engagement_requirements_extend.py`

| table                       | column   | type                                                                                                                          | notes |
|-----------------------------|----------|-------------------------------------------------------------------------------------------------------------------------------|-------|
| `engagement_requirements`   | `status` | TEXT, CHECK enum, default `'needed'`                                                                                          | `needed` / `requested` / `received` / `waived` |
| `engagement_requirements`   | `notes`  | TEXT                                                                                                                          | Free-form |

`engagement_requirements.value` (existing) **stays as the
human-readable requirement description**. New `notes` is for
follow-up context ("Asked mom 5/8" / "PDF in family folder").

### Backfill notes

- Existing `engagement_tasks`: `activity_kind='task'`,
  `structured_content='{}'`. Renders as plain bespoke-style rows in
  the new UI (notes only). Re-categorize per row via the kebab menu.
- Existing `school_visits` / `school_recommendations`:
  `engagement_task_id=NULL`. Stay valid as standalone records.
- Existing `agreements`: `sent_at=NULL`. Active agreements with no
  `sent_at` get a UI hint that "we don't know when this was sent."
- Existing `engagement_requirements`: `status='received'` if they
  have a `value`, else `'needed'`. Conservative — assume past
  requirements were filed.

## API changes

### Tasks API — extend existing endpoints, don't move

**Existing path is `/api/tasks/{task_id}`, not nested under engagement.** Don't drift.

- `GET /api/engagements/{id}/tasks` — extend response shape with
  `activity_kind` + `structured_content`.
  - Add `?include_skipped=true|false` (default `false`).
  - Note: linked `school_visits` / `school_recommendations` still
    render even when their orchestrating task is skipped — visits
    and recs are real records.
- `PATCH /api/tasks/{task_id}` — accept `activity_kind` +
  `structured_content` in the body.
  - Validate the **pair after merge**: discriminator is the DB
    column `activity_kind`; Pydantic discriminated union by that
    field; if the merged content has keys foreign to the kind,
    reject (400 "Invalid keys for activity_kind=X: [...]").
  - On `activity_kind` change in the PATCH: reset
    `structured_content` to `{}` unless the caller also supplies a
    fresh content blob for the new kind.
  - For `document_review` content: validate every document id in
    `educational_doc_ids` + `medical_doc_ids` exists and is on this
    engagement's family. Reject 400 with offending id.
- `POST /api/tasks/{task_id}/skip` — sets `status='not_applicable'`,
  idempotent. Separate from PATCH so the audit log shows the skip
  as a discrete event.
- `DELETE /api/tasks/{task_id}` — stays a **hard delete**. Should
  only be hit for bespoke (`fromCatalog=false`) tasks per the UI
  contract; backend permits hard delete on any task without
  active links to a visit/rec (those should be deleted/unlinked
  first, or the task gets soft-orphaned via FK SET NULL).

### School visits + recommendations — atomic create endpoints

- `POST /api/engagements/{id}/school-visits`
  - Body: full `school_visits` create payload (school_id,
    visit_date, ...) plus optional `task_title` override.
  - Transaction:
    1. Validate the school exists.
    2. INSERT engagement_tasks (activity_kind='school_visit',
       title = "Campus visit — {school name}" or override,
       engagement_id, sort_order = next).
    3. INSERT school_visits with engagement_task_id = new task,
       engagement_id same as task.
  - Returns: both records.
  - 409 paths: none expected (school_visits has no unique
    constraints beyond the new partial-unique on
    engagement_task_id, which is freshly created).
- `POST /api/engagements/{id}/school-recommendations`
  - Same shape.
  - **Collision behavior (per Joe sign-off):** if a recommendation
    for `(engagement_id, school_id)` already exists, return **409
    "Recommendation already exists for this school on this
    engagement; edit it instead."** Do **not** create a task and
    fail downstream — validate the rec uniqueness *before* the
    task insert, so we don't leave an orphaned task on failure.

### Cross-engagement validation (both endpoints)

The new partial-unique indexes enforce 1:1 at the DB level. The API
must also reject PATCHes that would point a `school_visits.engagement_task_id`
or `school_recommendations.engagement_task_id` at a task on a
**different** engagement. Add a validation check that
`task.engagement_id == visit.engagement_id`. FK alone doesn't
enforce that.

### Agreements API — extend existing endpoint

`POST /api/engagements/{id}/agreements` **already exists**. Extend
it to accept `type` (`services_contract` / `medical_release`) and
create the row with `status='draft'`, no `document_id`, no
`sent_at`.

- `POST /api/agreements/{id}/mark-sent` — new. Sets
  `sent_at = NOW()`. Status stays `draft`. Idempotent (re-sending
  doesn't reset the timestamp; the UI can offer a "Re-send" affordance
  that overwrites if desired).
- `POST /api/agreements/{id}/upload-signed` — new. Multipart file
  upload. Creates a `documents` row, sets
  `agreements.document_id` + `signed_at = NOW()` +
  `status = 'active'`.
- The "Supersede" UX flips `status = 'superseded'` on the existing
  row and lets the consultant create a new draft of the same type.

### Convert auto-seed

`POST /api/intakes/{id}/convert` (PR #107) gets extended to
**call the existing `bulk-from-catalog` helper** internally,
seeding `engagement_tasks` for all applicable `service_items` in
the convert transaction. Don't duplicate the helper logic; share
it.

Idempotency: convert is already guarded by `converted_at`.
`bulk-from-catalog` is already idempotent on
`(engagement_id, service_item_id)`. So convert + manual seeding
can interleave safely.

## UI changes

### Files

- **Replace contents** of
  `spa/src/pages/engagements/EngagementDetail.tsx` with the
  mockup-style layout. Keep file name + route.
- **Delete** `spa/src/pages/engagements/EngagementMockup.tsx` and
  the `/mockup/engagement-detail` route from `App.tsx`.
- **Reuse** `RichTextEditor`, `LabeledField`, `PageHeader`,
  `ghostFieldSx`, `StatusChip`.

### State pattern

- One TanStack query each for:
  - engagement (existing endpoint)
  - tasks (existing endpoint, extended fields)
  - school_visits filtered to this engagement
  - school_recommendations filtered to this engagement
  - time_entries filtered to this engagement
  - expenses filtered to this engagement
  - engagement_requirements filtered to this engagement
  - agreements filtered to this engagement
- Activities list = client-side merge of (tasks + visits + recs),
  sorted by `sort_order` (visits + recs inherit from their linked
  task; orphaned visits/recs without a task sort last).
- Per-field PATCH-on-blur for text; PATCH-on-change for selects /
  chips / status toggles.
- Locked rows (`invoice_id` set) render read-only with lock icon +
  invoice chip. UI must **gracefully handle 400** if the backend
  rejects an edit attempt on a locked row anyway (race condition
  protection).
- Backend hard-delete on a task with an orphaned visit/recommendation
  link via SET NULL should not surprise; UI confirm dialog mentions
  what will be unlinked.

### Cache invalidation patterns

Define a small `invalidateEngagementSurfaces(qc, engagementId)` helper:

| mutation                          | invalidate                                                                                         |
|-----------------------------------|----------------------------------------------------------------------------------------------------|
| task PATCH                        | `["engagements", id, "tasks"]`                                                                     |
| task DELETE / skip                | `["engagements", id, "tasks"]`, `["engagements", id, "school-visits"]`, `["engagements", id, "school-recommendations"]` (links may go SET NULL) |
| school_visit create               | `["engagements", id, "school-visits"]`, `["engagements", id, "tasks"]`, `["schools", schoolId]`, `["schools", "list"]` (visit count) |
| school_recommendation create      | `["engagements", id, "school-recommendations"]`, `["engagements", id, "tasks"]`, `["schools", schoolId]`, `["families", familyId]` (rec list) |
| time_entry create / patch / delete| `["engagements", id, "time"]`, `["engagements", id, "fee-rollup"]`                                  |
| expense create / patch / delete   | `["engagements", id, "expenses"]`                                                                  |
| agreement create / state change   | `["engagements", id, "agreements"]`                                                                |
| requirement create / patch / del  | `["engagements", id, "requirements"]`                                                              |

### Visit hours vs time entries

`school_visits.hours` is **independent** from `time_entries.hours`.
UI must not conflate them. Visit hours capture "the meeting was 9–12";
billable time goes through time_entries. The UI shows visit hours
on the visit row only, never in the engagement-level totals.

## PR breakdown

**PR-Backend-A1: schema + activity_kind + catalog backfill** (~350 LoC)

- Migration `0010_engagement_activity_kind`:
  - engagement_tasks.activity_kind + structured_content
  - service_items.default_activity_kind
  - Day-one backfill of canonical catalog items
- Pydantic + extended GET/PATCH on `/api/tasks/{task_id}` accepting
  the new fields, with discriminated-union validation.
- POST `/api/tasks/{task_id}/skip`.
- pytest: kind/content round-trip, discriminator validation, skip
  endpoint, catalog backfill correctness.

**PR-Backend-A2: visit/recommendation linkage + atomic create** (~300 LoC)

- Migration `0011_engagement_task_links` (FK + partial unique
  indexes).
- New `POST /api/engagements/{id}/school-visits` + atomic
  task+visit insert with cross-engagement validation.
- New `POST /api/engagements/{id}/school-recommendations` + same
  pattern + 409 on existing rec for same school.
- pytest: atomic create rolls back both on partial failure;
  cross-engagement validation rejects mis-linked tasks; 409 on
  rec collision; partial unique index enforces 1:1.

**PR-Backend-A3: convert auto-seed** (~80 LoC)

- Extend `POST /api/intakes/{id}/convert` to call the existing
  bulk-from-catalog helper inside the convert transaction.
- pytest: convert seeds tasks for the engagement_type's applicable
  catalog items; idempotent on re-convert (already guarded by
  converted_at but verify); manual bulk-from-catalog still works
  alongside.

**PR-Backend-B: agreements + requirements** (~300 LoC)

- Migration `0012_agreements_sent_at` (add `sent_at TIMESTAMPTZ`).
- Migration `0013_engagement_requirements_extend` (add `status` +
  `notes`, backfill `status` from presence of `value`).
- Extend `POST /api/engagements/{id}/agreements` to accept type +
  default to draft state.
- New `POST /api/agreements/{id}/mark-sent`.
- New `POST /api/agreements/{id}/upload-signed`.
- Extend GET/PATCH on `engagement_requirements` to surface status
  + notes.
- pytest: agreement state transitions (draft → sent → signed →
  superseded); requirements PATCH round-trip; supersede creates
  successor.

**PR-Frontend: UI swap** (~1500 LoC, replaces ~1330)

- Replace `EngagementDetail.tsx` with the mockup-style layout.
- Delete mockup file + route.
- Wire all surfaces to real APIs.
- Cache invalidation table above.
- Visit hours vs time hours rendered distinctly.
- Manual QA: convert → engagement page loads with seeded
  activities; check off / skip catalog item; add bespoke; add
  campus visit (creates linked visit row that also shows on the
  school page); add recommendation (409 if dup); log time +
  expense; mark agreement sent; upload signed.

**PR-Tail: PDF generation** (deferred, separate effort)

- Server-side template rendering for services agreement + medical
  release. Likely weasyprint with Jinja templates. Creates
  `documents` rows on "Create draft" + attaches them to agreements.

Order: A1 → A2 → A3 → B → Frontend → Tail.

## Decisions locked

1. **`activity_kind` inline enum + `structured_content` JSONB** on
   engagement_tasks. Pydantic discriminated unions enforce per-kind
   shape; the (kind, content) pair is validated after merge.
2. **Cross-table activities** via sparse `engagement_task_id` FK on
   school_visits + school_recommendations.
3. **1:1 task ↔ visit / task ↔ recommendation** enforced via partial
   unique indexes. N:1 future case requires dropping the index.
4. **"Sent" state mapped via `(status='draft' AND sent_at IS NOT
   NULL)`**. New `agreements.sent_at` migration; no enum change.
5. **Recommendation collision = 409.** No auto-link, no auto-update.
6. **Convert auto-seeds tasks** via the existing bulk-from-catalog
   helper. Behavior change from today's no-auto-seed.
7. **Day-one default_activity_kind catalog backfill** for the four
   canonical kinds. Otherwise converted engagements look generic.
8. **Frontend composes activities** from 3 queries with client-side
   merge. No server-side union view.
9. **Hard delete vs Skip** preserved. Skip → `not_applicable`;
   Delete → hard remove. UI only offers Delete for bespoke tasks.

## Risks

- **Structured_content shape drift.** JSONB is permissive even
  with discriminated unions. New kinds need their Pydantic schema
  registered or PATCH validation fails opaquely.
- **Orphaned visits/recs** if a task is hard-deleted. FK SET NULL
  keeps the visit/rec valid but unlinks it; visit/rec then renders
  as "orphan" in the engagement detail. UI should surface that.
- **Cross-engagement linking via PATCH** — the API validation
  prevents pointing a visit at a task on another engagement.
  Tests must cover this; FK alone is silent.
- **Invoiced rows + UI race**: backend returns 400 on edit/delete
  of locked time/expense rows. UI disables them, but if a
  background invoice creates after the user starts editing, the
  PATCH 400s. Snackbar + reload.
- **Existing tasks render as "task" kind** look bare in the new
  UI. Acceptable; consultants re-categorize via the kebab.
- **Existing engagements have no intake_snapshot.** UI shows
  empty-state with a link to the intake.
- **agreements.sent_at adds a column that existing data leaves
  NULL.** Active agreements that predate this work show "no send
  date on file" — UI hint, no data loss.

## Open questions

None blocking. Ready to build PR-Backend-A1.
