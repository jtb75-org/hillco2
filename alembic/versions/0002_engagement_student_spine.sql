-- 0002: spine flip — engagements move from M:N (via the engagement_students
-- junction) to a 1:1 student_id FK. This matches Joe's intended workflow
-- (each engagement is for one student; twins get two engagements because
-- services may differ). Family stays as a denormalized rollup column on
-- engagements with a composite FK guard so it cannot drift from
-- students.family_id.
--
-- learning_profiles also collapses: today it has UNIQUE(engagement_id,
-- student_id) for the M:N case; under the new model engagement uniquely
-- determines student, so the invariant is UNIQUE(engagement_id) and the
-- redundant student_id column is dropped.
--
-- The engagement_students junction is intentionally NOT dropped here —
-- expand/contract: this migration ships alongside route code that reads
-- from engagements.student_id, and a follow-up migration drops the table
-- once the new code is rolled.

-- ---- Preflight: refuse to flip if existing data violates the new model.

DO $$
DECLARE
    bad_count BIGINT;
BEGIN
    -- 1. Active engagements with zero junction rows. Today's create-engagement
    -- route accepts student_ids=[] (defaults empty), so this category may
    -- have rows in older databases.
    SELECT COUNT(*) INTO bad_count
      FROM engagements e
     WHERE e.deleted_at IS NULL
       AND NOT EXISTS (
             SELECT 1 FROM engagement_students es
              WHERE es.engagement_id = e.id
       );
    IF bad_count > 0 THEN
        RAISE EXCEPTION
            '0002 preflight: % active engagement(s) have no student. Resolve before the spine flip.', bad_count;
    END IF;

    -- 2. Engagements with multiple students. Per Joe these don't exist in
    -- practice, but defensive — a multi-student engagement would silently
    -- collapse to whichever junction row is read first.
    SELECT COUNT(*) INTO bad_count FROM (
        SELECT engagement_id FROM engagement_students
         GROUP BY engagement_id
        HAVING COUNT(*) > 1
    ) x;
    IF bad_count > 0 THEN
        RAISE EXCEPTION
            '0002 preflight: % engagement(s) have multiple students; the new spine assumes 1:1.', bad_count;
    END IF;

    -- 3. Junction student family must already match engagement family.
    -- Otherwise the soon-to-be-redundant engagements.family_id column is
    -- already corrupt and dropping the consistency check would lock that in.
    SELECT COUNT(*) INTO bad_count
      FROM engagement_students es
      JOIN students     s ON s.id = es.student_id
      JOIN engagements  e ON e.id = es.engagement_id
     WHERE s.family_id <> e.family_id;
    IF bad_count > 0 THEN
        RAISE EXCEPTION
            '0002 preflight: % engagement_students row(s) cross family boundaries; manual cleanup required.', bad_count;
    END IF;

    -- 4. Junction student must not be soft-deleted while engagement is active.
    SELECT COUNT(*) INTO bad_count
      FROM engagement_students es
      JOIN students     s ON s.id = es.student_id
      JOIN engagements  e ON e.id = es.engagement_id
     WHERE s.deleted_at IS NOT NULL AND e.deleted_at IS NULL;
    IF bad_count > 0 THEN
        RAISE EXCEPTION
            '0002 preflight: % active engagement(s) link a soft-deleted student.', bad_count;
    END IF;
END $$;

-- ---- Phase 1: add nullable student_id, backfill from junction.

ALTER TABLE engagements
    ADD COLUMN student_id UUID;

UPDATE engagements e
   SET student_id = es.student_id
  FROM engagement_students es
 WHERE es.engagement_id = e.id;

DO $$
DECLARE missing BIGINT;
BEGIN
    SELECT COUNT(*) INTO missing
      FROM engagements
     WHERE student_id IS NULL AND deleted_at IS NULL;
    IF missing > 0 THEN
        RAISE EXCEPTION
            '0002 backfill incomplete: % active engagement(s) still have NULL student_id.', missing;
    END IF;
END $$;

-- ---- Phase 2: enforce shape.

-- A composite FK against (id, family_id) on students requires an explicit
-- UNIQUE constraint; Postgres won't infer one from the PK alone.
ALTER TABLE students
    ADD CONSTRAINT students_id_family_unique UNIQUE (id, family_id);

ALTER TABLE engagements
    ALTER COLUMN student_id SET NOT NULL,
    ADD CONSTRAINT engagements_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
    ADD CONSTRAINT engagements_student_family_consistent
        FOREIGN KEY (student_id, family_id)
        REFERENCES students(id, family_id);

-- Cheap rollup: students -> active engagements.
CREATE INDEX engagements_student_active_idx
    ON engagements(student_id)
 WHERE deleted_at IS NULL;

-- ---- Phase 3: tighten learning_profiles to the new 1:1 shape.

-- Today: UNIQUE(engagement_id, student_id). After the flip the engagement
-- alone determines the student, so the invariant is UNIQUE(engagement_id)
-- and the student_id column is just a drift hazard.
ALTER TABLE learning_profiles
    DROP COLUMN student_id CASCADE;

ALTER TABLE learning_profiles
    ADD CONSTRAINT learning_profiles_engagement_id_key UNIQUE (engagement_id);
