-- 0013: drop the four legacy tables now that nothing reads them.
--
-- Migration 0008 created the people spine and backfilled from
-- `parents`, `students`, and `contacts` (school workers). 0012 did
-- the same for `users`, plus repointed all FKs to people. Routes
-- have been switched in PRs 2b/2c/2d/3. The legacy tables have been
-- read-only ghosts ever since; this migration removes them.
--
-- Order matters because of FKs:
--   * `parents`, `students`, `contacts` cascade-from `families`
--     and `schools`, but no other table references them anymore
--     (engagements.student_id and learning_supports.student_id were
--     repointed at people in 0010; school_visit_attendees.contact_id
--     in 0011; engagements/notes/etc. created_by in 0012).
--   * `users` is similarly free of inbound references after 0012.
--
-- Defensive preflight: refuse to drop if any inbound FK still points
-- here. This catches a future schema change that re-introduces a
-- reference without going through the people spine.

DO $$
DECLARE
    bad TEXT;
BEGIN
    SELECT string_agg(format('%I.%I → %I', n.nspname, c.relname, ref.relname), ', ')
      INTO bad
      FROM pg_constraint con
      JOIN pg_class c    ON c.oid   = con.conrelid
      JOIN pg_namespace n ON n.oid  = c.relnamespace
      JOIN pg_class ref  ON ref.oid = con.confrelid
     WHERE con.contype = 'f'
       AND ref.relname IN ('parents', 'students', 'contacts', 'users');
    IF bad IS NOT NULL THEN
        RAISE EXCEPTION
            '0013 preflight: an FK still references a legacy table: %', bad;
    END IF;
END $$;

DROP TABLE parents;
DROP TABLE students;
DROP TABLE contacts;
DROP TABLE users;

-- Drop the now-orphaned UNIQUE constraint that 0002 added to support
-- the engagements composite FK on students(id, family_id). The
-- students table is gone, so the constraint went with it; this is
-- a no-op but kept here as documentation.
