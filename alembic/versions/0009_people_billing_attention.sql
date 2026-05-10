-- 0009: dedicated billing_attention_to column on people.
--
-- Migration 0008's backfill dumped `parents.billing_attention_to` into
-- `people.notes` because there was no purpose-built column. That hack
-- conflates "attention line for the invoice" with general per-person
-- notes. Add the proper column, hoist any backfilled value back out
-- of notes, and the upcoming families.py route swap can use a clean
-- field.

ALTER TABLE people
    ADD COLUMN billing_attention_to TEXT;

-- Hoist values back from notes for any person whose legacy parents
-- row had a billing_attention_to. Only clear notes if it still equals
-- the legacy value (the operator may have appended real notes since).
UPDATE people p
   SET billing_attention_to = legacy.billing_attention_to,
       notes = CASE WHEN p.notes = legacy.billing_attention_to THEN NULL
                    ELSE p.notes END
  FROM parents legacy
 WHERE p.id = legacy.id
   AND legacy.billing_attention_to IS NOT NULL;
