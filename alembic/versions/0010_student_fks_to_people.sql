-- 0010: repoint student FKs from legacy `students` to `people`.
--
-- Migration 0008 created the people spine and backfilled student ids
-- preserving the same UUID. The route swap in PR-2c switches student
-- writes from the legacy students table to people + family_students +
-- student_details, so any FK that references students(id) now needs
-- to reference people(id) instead.
--
-- The composite FK on engagements (student_id, family_id) →
-- students(id, family_id) is dropped: people doesn't carry family_id
-- (the relationship lives on family_students). Drift between
-- engagement.student_id family and engagement.family_id is now
-- enforced at the application layer in
-- engagements._validate_student_in_family. A trigger-based
-- replacement is a possible future hardening.

ALTER TABLE engagements DROP CONSTRAINT engagements_student_family_consistent;
ALTER TABLE engagements DROP CONSTRAINT engagements_student_id_fkey;
ALTER TABLE engagements
    ADD CONSTRAINT engagements_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES people(id) ON DELETE RESTRICT;

ALTER TABLE learning_supports DROP CONSTRAINT learning_supports_student_id_fkey;
ALTER TABLE learning_supports
    ADD CONSTRAINT learning_supports_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES people(id) ON DELETE CASCADE;
