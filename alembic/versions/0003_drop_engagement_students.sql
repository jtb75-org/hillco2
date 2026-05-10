-- 0003: drop the engagement_students junction.
--
-- The spine flip in 0002 added engagements.student_id and updated every
-- consuming route to read from it directly. The junction has been
-- intentionally retained as a no-op since then; this migration removes
-- it now that the new code is rolled.
--
-- Defensive preflight: if any row in engagement_students disagrees with
-- engagements.student_id, fail loudly. That would mean some path has
-- been writing the junction without going through the route layer.

DO $$
DECLARE drift BIGINT;
BEGIN
    SELECT COUNT(*) INTO drift
      FROM engagement_students es
      JOIN engagements e ON e.id = es.engagement_id
     WHERE e.student_id IS DISTINCT FROM es.student_id;
    IF drift > 0 THEN
        RAISE EXCEPTION
            '0003 preflight: % engagement_students row(s) disagree with engagements.student_id. Investigate before dropping the junction.', drift;
    END IF;
END $$;

DROP TABLE engagement_students;
