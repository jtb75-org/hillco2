# Plan v2: new intake page (Discovery model)

Status: locked. Folds in pushback from vera (codex) and halo (gemini) and
the contested-call decisions Joe made on 2026-05-16. Mockup at
`/mockup/intake-discovery` on branch `mockup/intake-discovery`.

## Goal

Replace `/intakes/:id` with the Discovery layout the mockup
demonstrates. Intake remains the **free** initial-meeting record that
populates Family + Contacts; the structured outputs of that meeting
(family context, per-student discovery, fit/outcome decision, optional
engagement creation) all happen here. The intake also drives the
family's lifecycle stage so the list doesn't clutter with declined
prospects.

## Non-goals

- Intake LIST page redesign beyond a tiny tail PR that adds the outcome
  chip + next_step_due column.
- New-intake CREATION wizard (duplicate-detection on family picker).
  Convert endpoint will protect against duplicate active engagements
  for the same intake/student, but full family-side dedupe is later.
- Promoting "mentioned during discovery" chips into real entities.
- Standalone UI for editing `families.lifecycle_stage` manually. The
  column is added and auto-flipped by the intake flow; a manual editor
  comes later.

## Schema diff

One Alembic migration: `alembic/versions/0009_intake_discovery.py`.

### `intakes` — new columns

| column                | type                    | notes |
|-----------------------|-------------------------|-------|
| `referral_source`     | TEXT, CHECK enum        | `word_of_mouth / pediatrician / therapist / school / search / returning / other`; nullable |
| `desired_outcome`     | TEXT                    | plain text (templated into engagement snapshot) |
| `constraints`         | JSONB, default `'[]'`   | array of strings |
| `consent_granted`     | BOOLEAN, **nullable**   | unknown vs yes vs no |
| `family_context_notes`| TEXT                    | rich-text HTML; family-context overflow |
| `decision_makers`     | JSONB, default `'[]'`   | array of `{person_id: UUID?, name: str, relation: str}` — `person_id` links into family guardians when known |
| `outcome`             | TEXT, CHECK enum        | `converting / nurture / declined_by_family / declined_by_hillco / no_response / duplicate`; nullable = "in progress" |
| `outcome_at`          | TIMESTAMPTZ             | API-stamped on outcome transition |
| `disposition_reason`  | TEXT                    | plain text |
| `next_step_owner`     | TEXT, CHECK enum        | `consultant / family / awaiting_records`; nullable |
| `next_step_due`       | DATE                    | nullable |
| `blocker`             | TEXT                    | plain, single-line |
| `converted_at`        | TIMESTAMPTZ             | idempotency guard for the convert flow |

Existing `intakes.notes` is **kept as-is** as the bottom catch-all
"Intake notes" rich-text bucket. The new `family_context_notes` is
distinct and lives in the Family Context card.

`completed_at` stays for backward compat. **No trigger.** The API sets
`outcome / outcome_at / completed_at` in a single transaction so
authority is in one place.

### `intake_students` — new columns

The existing junction (`intake_id, person_id`) gains per-intake-student
discovery + candidacy fields:

| column                          | type                  | notes |
|---------------------------------|-----------------------|-------|
| `working`                       | TEXT (HTML)           | "What's working" |
| `not_working`                   | TEXT (HTML)           | "What's not working" |
| `history`                       | TEXT (HTML)           | "History / timeline" |
| `school_fit`                    | TEXT (HTML)           | "School-fit concerns" |
| `supports_tried`                | TEXT (HTML)           | "Supports tried" |
| `candidate`                     | BOOLEAN, default false| candidate for engagement at convert time |
| `recommended_engagement_type`   | TEXT                  | FK-like to `engagement_types(code)`; validated via existing `_validate_engagement_type` helper |
| `mentions`                      | JSONB, default `'[]'` | array of `{text: str, kind: 'school' \| 'professional' \| 'program' \| 'other'}` — Pydantic-enforced shape |

### `engagements` — new column

| column            | type                  | notes |
|-------------------|-----------------------|-------|
| `intake_snapshot` | JSONB, nullable       | point-in-time copy of the intake's discovery context at convert time |

Shape:
```jsonc
{
  "snapshotted_at": "2026-05-16T14:22:00Z",
  "intake_id": "...",
  "family": {
    "desired_outcome": "...",
    "constraints": [...],
    "decision_makers": [...]
  },
  "student": {
    "working": "...",       // HTML
    "not_working": "...",
    "history": "...",
    "school_fit": "...",
    "supports_tried": "...",
    "mentions": [...]
  }
}
```

### `families` — new column

| column            | type                | notes |
|-------------------|---------------------|-------|
| `lifecycle_stage` | TEXT, CHECK enum    | `lead / prospect / client / archived`; default `'lead'` |

Existing families backfill to `'client'` if they have at least one
engagement, otherwise `'lead'`. No manual UI to manage this in this PR
set — auto-flips only.

Auto-flip rules (implemented in the intake flow):
- Intake's outcome flips to `declined_by_family` / `declined_by_hillco`
  / `no_response` AND family has zero active engagements → family
  becomes `archived`.
- Intake `convert` succeeds → family becomes `client`.
- Intake's outcome flips to `nurture` and family is `lead` → family
  becomes `prospect`.

### Engagement types — no new seed rows

Per Joe's call: use existing `assessment` + `full_placement` only. The
"School placement search" intake recommendation maps to
`full_placement`. The other categories from the mockup (IEP advocacy,
evaluation coordination, transition planning) wait for a follow-on PR
that seeds catalog memberships alongside the type rows.

The recommended-type picker in the SPA renders `engagement_types` live
from the API — so it'll show the two existing types after this lands.

## API changes

### `GET /api/intakes/{id}` — extended response

Adds all new intake columns + per-student discovery + candidacy.
Bakes-in `existing_engagements` per candidate student, filtered to
`status IN ('in_progress', 'on_hold') AND deleted_at IS NULL`. Shape:
```json
{
  "id": "...",
  "outcome": "converting",
  ...
  "students": [{
    "id": "...",
    "name": "Peter Ballard",
    "candidate": false,
    "recommended_engagement_type": "full_placement",
    "working": "<ul>...</ul>",
    ...
    "existing_engagements": [
      { "id": "...", "engagement_type": "full_placement", "status": "in_progress", "start_date": "2026-04-10" }
    ]
  }]
}
```

### `PATCH /api/intakes/{id}` — accept new fields

All scalar + JSON columns. Validation:
- Enum columns checked against their CHECK constraint values.
- `outcome` null → non-null: API sets `outcome`, `outcome_at = NOW()`,
  `completed_at = NOW()` in one transaction. Triggers family lifecycle
  auto-flip if applicable.
- `outcome` non-null → null: API clears `outcome_at` and `completed_at`
  in the same transaction. Family lifecycle does **not** auto-revert
  (one-way auto-flip; manual fix later if needed).

### `PATCH /api/intakes/{id}/students/{person_id}` — new endpoint

For the per-student discovery + candidacy fields. Validates student is
linked to the intake (reuses existing helper). Body accepts any subset
of: `working / not_working / history / school_fit / supports_tried /
candidate / recommended_engagement_type / mentions`.

### `POST /api/intakes/{id}/convert` — new endpoint

Body: `{}` (intake state drives behavior).

Transaction:
1. `SELECT ... FROM intakes WHERE id = $1 FOR UPDATE` to serialize.
2. Validate: `outcome === 'converting'`, `converted_at IS NULL`, ≥1
   `intake_students.candidate = true`, each candidate has a valid
   `recommended_engagement_type`.
3. For each candidate student, INSERT an engagement with:
   - `family_id`, `intake_id`
   - `engagement_type` from the recommendation
   - `status = 'in_progress'` (existing default; **not** `'lead'`)
   - `intake_snapshot` JSONB built from the intake's current state
   - Additional duplicate guard: reject if an `in_progress` /
     `on_hold` engagement already exists for the same
     `(intake_id, family_id, student_person_id, engagement_type)`. Yes,
     this means re-converting after editing the intake won't double-fire.
4. UPDATE `intakes` SET `converted_at = NOW()`.
5. UPDATE `families` SET `lifecycle_stage = 'client'`.

Returns: `{ engagement_ids: [...] }`. SPA navigates to first
engagement, or to a list view if more than one.

## UI changes

### Files
- **Replace** `spa/src/pages/intake/IntakeForm.tsx` with the new layout,
  consuming the real API. Keep file name + route.
- **Delete** `spa/src/pages/intake/IntakeDiscoveryMockup.tsx`.
- **Remove** the `/mockup/intake-discovery` route from `App.tsx`.
- **Reuse** `RichTextEditor`, `LabeledField`, `PageHeader`, the live
  `StudentEditor` (PR #105).
- **Extract** `ghostFieldSx` from the mockup into
  `spa/src/components/ghostFieldSx.ts` for future reuse.

### State pattern
- One TanStack Query `["intakes", id]` for the whole record.
- Per-field PATCH-on-blur (TextField) / PATCH-on-change (Select,
  Switch, Chip toggle) — same shape as live `StudentEditor`.
- Convert dialog → POST then `qc.invalidateQueries(["intakes", id])`
  and navigate.

### Engagement page (later, not this PR set)
- Render the `intake_snapshot` read-only with a small banner: *"Created
  from intake X on <date>. View latest intake →"*. This is the UX
  mitigation for snapshot drift that halo and vera both flagged.

## Migration of existing intakes

- Existing `intakes.notes` preserved verbatim as the bottom "Intake
  notes" rich-text bucket. No structured-field extraction.
- All new structured fields default to NULL / empty.
- Backfill rule for `completed_at IS NOT NULL AND outcome IS NULL`:
  - If the intake has any associated engagement records (via
    `engagements.intake_id`): `outcome = 'converting'`,
    `outcome_at = completed_at`, `converted_at = completed_at`.
  - Otherwise: `outcome = 'no_response'`, `outcome_at = completed_at`.
- All `intake_students` rows default to `candidate = false`. No
  retroactive engagement creation.
- `families` backfill: `lifecycle_stage = 'client'` if any
  engagement exists for the family, else `'lead'`.

## PR breakdown

**PR-Backend** *(~600 LoC: migration + Pydantic + endpoints + tests)*
- Migration 0009 with all schema changes, enum CHECK constraints,
  backfill logic for existing intakes + families.
- Pydantic model updates and validation.
- `GET /api/intakes/{id}` extended (incl. existing_engagements
  bake-in).
- `PATCH /api/intakes/{id}` and `.../students/{person_id}` updates.
- `POST /api/intakes/{id}/convert` with row-lock + dupe-engagement
  guard.
- Family lifecycle auto-flip logic.
- pytest coverage for: each new field validation, the outcome-state
  transition transaction, convert idempotency, backfill correctness,
  concurrent convert (with a forced concurrent-request test).

**PR-Frontend** *(~700 LoC, replaces ~1400 LoC of the old form)*
- Replace `IntakeForm.tsx` with new layout consuming the new API.
- Delete `IntakeDiscoveryMockup.tsx` and the mockup route.
- Wire all fields to PATCH/GET; wire convert dialog to POST.
- Reuse live `StudentEditor` in the "edit student details" accordion.
- Manual QA: open an existing intake (old `notes` preserved, structured
  fields empty), create a new intake, convert with 1 and 2 candidates.

**PR-Tail** *(~80 LoC)*
- Surface `outcome` chip + `next_step_due` column in the existing
  intake list (`/intakes`). Tiny, optional — could ship same day as
  Frontend.

Order: Backend → Frontend → Tail.

## Decisions locked

1. **`decision_makers` as JSONB with shape**: `{person_id?, name,
   relation}`. Links to people records when known; free-text otherwise.
2. **`mentions` as JSONB with shape**: `{text, kind: enum}`. Pydantic
   enforced. Promotion to entities is a later concern.
3. **API owns `outcome` / `outcome_at` / `completed_at` transition** —
   no Postgres trigger. Single source of truth, debuggable.
4. **No new engagement_types in this PR set.** `placement` → reuse
   existing `full_placement`. Other categories wait for a catalog
   PR.
5. **`status='in_progress'`** on convert-created engagements (not the
   nonexistent `'lead'`).
6. **`intake_snapshot` as single JSONB column** on `engagements`.
7. **Family lifecycle stage in scope.** `lead / prospect / client /
   archived`, auto-flipped from intake events. No manual UI yet.
8. **No feature flag.** Frontend PR is git-revertable if needed.

## Risks

- **API multi-write transactions:** convert touches engagements,
  intakes, and families. All must be in one transaction or rollback
  cleanly. Test the partial-failure paths.
- **Snapshot drift:** post-convert intake edits don't reach the
  engagement. Mitigation: engagement page surfaces the "view latest
  intake" link and a "snapshotted on" timestamp. UI for this is later,
  but the data shape supports it from day one.
- **Family lifecycle auto-flip surprises:** if a consultant flips
  outcome between values, the family may move stages in ways that
  surprise. Mitigation: the auto-flip is one-way (outcome → stage,
  never reverse) and the rules are documented. Tests cover each
  transition. A manual stage editor is later.
- **HTML sanitization surface multiplies:** five new rich-text fields
  per intake-student + one new family-level rich-text. Use the same
  DOMPurify pipeline that the existing `notes` field uses; centralize
  in one render helper.
- **Engagement type catalog tension:** the SPA mockup shows four
  categories (placement, iep_support, evaluation_coordination,
  transition_planning) but the live picker will only show two
  (assessment, full_placement). Document this gap in the SPA's
  recommended-type picker copy until the catalog PR lands.
- **Concurrent convert race covered** by `SELECT … FOR UPDATE` +
  `converted_at IS NULL` check + the per-engagement-type dupe guard.

## Open questions

None blocking. Ready to build PR-Backend.
