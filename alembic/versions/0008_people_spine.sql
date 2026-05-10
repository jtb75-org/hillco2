-- 0008: introduce `people` as the unified spine for everyone.
--
-- Today the same kind of contact info (name, email, phone, address)
-- lives on three duplicate columns in three tables: `parents` (family
-- guardians), `students` (kids), and `contacts` (school workers). Joe's
-- design folds those into a single `people` table with a `kind` enum,
-- thin detail tables for kind-specific data, and family relationships
-- as junction tables.
--
-- This is the EXPAND step. The new tables get created and backfilled
-- from the legacy tables; nothing changes for the existing routes
-- yet. PR-2 (0009) switches consumer routes to the new shape; PR-3
-- (0010) folds the `users` auth table into `people` + a 1:1 `auth`
-- detail table; PR-4 (0011) drops the legacy tables.
--
-- Backfill is best-effort:
--   * `name` → `first_name` + `last_name` via SPLIT_PART. A single-
--     token name lands entirely in `first_name`.
--   * `parents.billing_address` was a single TEXT blob; it gets dumped
--     into `people.billing_street1` so no data is lost. The SPA's
--     address editor in PR-2 lets the operator tidy it up into the
--     real structured fields.
--   * Soft-delete state is preserved (`deleted_at` carried over).
--   * Legacy ids are preserved as `people.id` so any audit_log entry
--     keyed on the old `parents.id` / `students.id` / `contacts.id`
--     still resolves to the same UUID after the migration.

-- ============================================================
-- Types
-- ============================================================

CREATE TYPE person_kind AS ENUM (
    'guardian',
    'student',
    'school_worker',
    'other'
);

-- ============================================================
-- people: the spine
-- ============================================================

CREATE TABLE people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind person_kind NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT,
    email CITEXT,
    phone TEXT,
    birthday DATE,
    -- Single structured address. All nullable — populate what you have.
    street1 TEXT,
    street2 TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,
    -- Optional billing-address override. SPA renders billing_* when
    -- any of these are populated; otherwise falls back to the regular
    -- address. NOT a separate sub-record because it's a 1:1 override.
    billing_street1 TEXT,
    billing_street2 TEXT,
    billing_city TEXT,
    billing_state TEXT,
    billing_postal_code TEXT,
    billing_country TEXT,
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX people_kind_idx ON people(kind);
CREATE INDEX people_active_idx ON people(id) WHERE deleted_at IS NULL;
CREATE INDEX people_name_idx ON people(last_name, first_name);
-- Email is NOT unique on people — couples share addresses, kids may
-- borrow a parent's. Auth identity uniqueness lives on auth_identities
-- (added in PR-3), not here.
CREATE INDEX people_email_idx ON people(email) WHERE email IS NOT NULL;

-- ============================================================
-- family_guardians: M:N families ↔ guardian-people
-- ============================================================

CREATE TABLE family_guardians (
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
    -- parent_role enum already exists (0001 baseline): mom/dad/guardian/other.
    -- Reuse rather than create a parallel enum — same value space.
    relationship parent_role NOT NULL DEFAULT 'other',
    is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
    is_billing_contact BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (family_id, person_id)
);

CREATE INDEX family_guardians_person_idx ON family_guardians(person_id);

-- Mirrors the partial UNIQUEs on `parents` from migrations 0004 + 0007.
CREATE UNIQUE INDEX family_guardians_one_primary_per_family
    ON family_guardians (family_id) WHERE is_primary_contact;
CREATE UNIQUE INDEX family_guardians_one_billing_per_family
    ON family_guardians (family_id) WHERE is_billing_contact;

-- ============================================================
-- family_students: M:N families ↔ student-people
-- ============================================================

CREATE TABLE family_students (
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (family_id, person_id)
);

CREATE INDEX family_students_person_idx ON family_students(person_id);

-- ============================================================
-- student_details: 1:1 with people where kind='student'
-- ============================================================

CREATE TABLE student_details (
    person_id UUID PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
    -- All carried straight over from the legacy `students` table.
    current_school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    current_grade TEXT,
    has_504 BOOLEAN NOT NULL DEFAULT FALSE,
    has_iep BOOLEAN NOT NULL DEFAULT FALSE,
    has_learning_disability BOOLEAN NOT NULL DEFAULT FALSE,
    autism_level SMALLINT CHECK (autism_level BETWEEN 1 AND 3),
    has_adhd BOOLEAN NOT NULL DEFAULT FALSE,
    has_intellectual_disability BOOLEAN NOT NULL DEFAULT FALSE,
    has_health_impairment BOOLEAN NOT NULL DEFAULT FALSE,
    has_emotional_disturbance BOOLEAN NOT NULL DEFAULT FALSE,
    diagnosis_other TEXT,
    needs_goals TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX student_details_school_idx ON student_details(current_school_id);

-- ============================================================
-- school_worker_details: 1:1 with people where kind='school_worker'
-- ============================================================

CREATE TABLE school_worker_details (
    person_id UUID PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    role TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX school_worker_details_school_idx ON school_worker_details(school_id);

-- ============================================================
-- Triggers (matches the 0001 baseline pattern)
-- ============================================================

CREATE TRIGGER people_set_updated_at BEFORE UPDATE ON people
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER people_audit AFTER INSERT OR UPDATE OR DELETE ON people
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER family_guardians_set_updated_at BEFORE UPDATE ON family_guardians
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER family_guardians_audit AFTER INSERT OR UPDATE OR DELETE ON family_guardians
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER student_details_set_updated_at BEFORE UPDATE ON student_details
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER student_details_audit AFTER INSERT OR UPDATE OR DELETE ON student_details
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER school_worker_details_set_updated_at BEFORE UPDATE ON school_worker_details
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER school_worker_details_audit AFTER INSERT OR UPDATE OR DELETE ON school_worker_details
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- family_students has no updated_at (just a junction); audit_trigger
-- still wired for visibility on add/remove.
CREATE TRIGGER family_students_audit AFTER INSERT OR UPDATE OR DELETE ON family_students
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ============================================================
-- Backfill: parents → people + family_guardians
-- ============================================================

INSERT INTO people (
    id, kind, first_name, last_name, email, phone,
    billing_street1, billing_street2,
    notes, created_at, updated_at
)
SELECT
    p.id,
    'guardian'::person_kind,
    -- "Jane Smith" → "Jane" / "Smith"; "Madonna" → "Madonna" / NULL
    COALESCE(NULLIF(SPLIT_PART(p.name, ' ', 1), ''), p.name),
    NULLIF(TRIM(SUBSTRING(p.name FROM POSITION(' ' IN p.name) + 1)), ''),
    p.email,
    p.phone,
    -- Old billing_address was a single TEXT blob. Dump it into
    -- billing_street1 verbatim so no data is lost; the SPA's address
    -- editor (PR-2) lets the operator restructure it.
    p.billing_address,
    NULL,
    p.billing_attention_to,
    p.created_at,
    p.updated_at
  FROM parents p;

INSERT INTO family_guardians (
    family_id, person_id, relationship,
    is_primary_contact, is_billing_contact,
    created_at, updated_at
)
SELECT
    p.family_id,
    p.id,
    p.role,
    p.is_primary_contact,
    p.is_billing_contact,
    p.created_at,
    p.updated_at
  FROM parents p;

-- ============================================================
-- Backfill: students → people + family_students + student_details
-- ============================================================

INSERT INTO people (
    id, kind, first_name, last_name, birthday,
    deleted_at, created_at, updated_at
)
SELECT
    s.id,
    'student'::person_kind,
    COALESCE(NULLIF(SPLIT_PART(s.name, ' ', 1), ''), s.name),
    NULLIF(TRIM(SUBSTRING(s.name FROM POSITION(' ' IN s.name) + 1)), ''),
    s.dob,
    s.deleted_at,
    s.created_at,
    s.updated_at
  FROM students s;

INSERT INTO family_students (family_id, person_id, created_at)
SELECT s.family_id, s.id, s.created_at FROM students s;

INSERT INTO student_details (
    person_id,
    current_school_id, current_grade,
    has_504, has_iep, has_learning_disability,
    autism_level,
    has_adhd, has_intellectual_disability,
    has_health_impairment, has_emotional_disturbance,
    diagnosis_other, needs_goals,
    created_at, updated_at
)
SELECT
    s.id,
    s.current_school_id, s.current_grade,
    s.has_504, s.has_iep, s.has_learning_disability,
    s.autism_level,
    s.has_adhd, s.has_intellectual_disability,
    s.has_health_impairment, s.has_emotional_disturbance,
    s.diagnosis_other, s.needs_goals,
    s.created_at, s.updated_at
  FROM students s;

-- ============================================================
-- Backfill: contacts (school workers) → people + school_worker_details
-- ============================================================
--
-- Orphan contacts (school_id IS NULL after a school deletion) become
-- kind='other' people; they're not really "school workers" without a
-- school. They keep their notes and contact info but get no detail row.

INSERT INTO people (
    id, kind, first_name, last_name, email, phone, notes,
    deleted_at, created_at, updated_at
)
SELECT
    c.id,
    CASE WHEN c.school_id IS NOT NULL THEN 'school_worker'::person_kind
         ELSE 'other'::person_kind END,
    COALESCE(NULLIF(SPLIT_PART(c.name, ' ', 1), ''), c.name),
    NULLIF(TRIM(SUBSTRING(c.name FROM POSITION(' ' IN c.name) + 1)), ''),
    c.email,
    c.phone,
    c.notes,
    c.deleted_at,
    c.created_at,
    c.updated_at
  FROM contacts c;

INSERT INTO school_worker_details (
    person_id, school_id, role, created_at, updated_at
)
SELECT
    c.id, c.school_id, c.role, c.created_at, c.updated_at
  FROM contacts c
 WHERE c.school_id IS NOT NULL;

-- ============================================================
-- Sanity assertions: every legacy row backfilled cleanly.
-- ============================================================

DO $$
DECLARE
    legacy BIGINT;
    migrated BIGINT;
BEGIN
    SELECT COUNT(*) INTO legacy FROM parents;
    SELECT COUNT(*) INTO migrated FROM people WHERE kind = 'guardian';
    IF migrated <> legacy THEN
        RAISE EXCEPTION '0008 backfill: parents=% but people(guardian)=%', legacy, migrated;
    END IF;

    SELECT COUNT(*) INTO legacy FROM students;
    SELECT COUNT(*) INTO migrated FROM people WHERE kind = 'student';
    IF migrated <> legacy THEN
        RAISE EXCEPTION '0008 backfill: students=% but people(student)=%', legacy, migrated;
    END IF;

    SELECT COUNT(*) INTO legacy FROM contacts;
    SELECT COUNT(*) INTO migrated
      FROM people WHERE kind IN ('school_worker', 'other')
                    AND id IN (SELECT id FROM contacts);
    IF migrated <> legacy THEN
        RAISE EXCEPTION '0008 backfill: contacts=% but corresponding people=%', legacy, migrated;
    END IF;

    -- Detail-table population should match exactly for students; for
    -- school workers it matches contacts that had a school_id.
    SELECT COUNT(*) INTO legacy FROM students;
    SELECT COUNT(*) INTO migrated FROM student_details;
    IF migrated <> legacy THEN
        RAISE EXCEPTION '0008 backfill: students=% but student_details=%', legacy, migrated;
    END IF;

    SELECT COUNT(*) INTO legacy FROM contacts WHERE school_id IS NOT NULL;
    SELECT COUNT(*) INTO migrated FROM school_worker_details;
    IF migrated <> legacy THEN
        RAISE EXCEPTION '0008 backfill: contacts(with-school)=% but school_worker_details=%', legacy, migrated;
    END IF;
END $$;
