-- 0011: repoint school_visit_attendees.contact_id from legacy `contacts`
-- to `people`.
--
-- Migration 0008 backfilled `contacts` into `people` (kind='school_worker'
-- when affiliated, kind='other' when orphaned) preserving ids. PR-2d
-- switched the contacts.py routes to read/write through people +
-- school_worker_details. school_visit_attendees.contact_id is the last
-- FK still pointing at the legacy contacts table; after this migration
-- nothing references contacts and the next migration can drop it.

ALTER TABLE school_visit_attendees
    DROP CONSTRAINT school_visit_attendees_contact_id_fkey;

ALTER TABLE school_visit_attendees
    ADD CONSTRAINT school_visit_attendees_contact_id_fkey
        FOREIGN KEY (contact_id) REFERENCES people(id) ON DELETE RESTRICT;
