-- 0004: family billing rollup + primary-contact uniqueness invariant.
--
-- Two changes:
--
-- 1. families gains billing_name / billing_email / billing_attention_to /
--    billing_address. The primary parent's contact info stays the
--    *default* for billing rendering; these are overrides used when
--    invoices need to be addressed to a trust account, an alternate
--    payer, or "send the invoice to Grandma." All four are nullable —
--    a family without overrides falls back to the primary parent.
--
-- 2. parents gets a partial UNIQUE index enforcing at most one
--    is_primary_contact per family. The existing routes already demote
--    any other primary before promoting a new one, so this codifies the
--    invariant the application implies. Allows zero primaries for
--    families in initial setup; rejects two.
--
-- Both changes are pure additions — no backfill, no shape risk.

ALTER TABLE families
    ADD COLUMN billing_name         TEXT,
    ADD COLUMN billing_email        CITEXT,
    ADD COLUMN billing_attention_to TEXT,
    ADD COLUMN billing_address      TEXT;

CREATE UNIQUE INDEX parents_one_primary_per_family
    ON parents (family_id)
 WHERE is_primary_contact;
