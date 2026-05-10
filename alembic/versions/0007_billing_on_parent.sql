-- 0007: move billing-contact data from family to parent.
--
-- Migration 0004 added four billing_* columns directly on `families`
-- as overrides for the SPA's billing block. In practice the bill goes
-- to a person (one of the parents, or a non-guardian like a trust /
-- grandparent who can be entered with role='other'). Duplicating that
-- person's name + email on the family is data drift waiting to happen.
--
-- Replace it with parent-level fields:
--   - is_billing_contact: which parent receives the invoice
--   - billing_address: where the invoice physically goes (when it
--     differs from any other address we might add later)
--   - billing_attention_to: optional "Attn:" line for trust accounts
--
-- The parent's existing `email` doubles as billing email — no separate
-- column needed. The billing block in the SPA derives everything from
-- the flagged parent.

-- Preflight: refuse to drop if any family has billing data set.
-- Migration 0004 shipped today; the live DB shouldn't have any
-- populated billing_* yet, but failing loudly beats silently dropping
-- data the operator forgot they entered.
DO $$
DECLARE in_use BIGINT;
BEGIN
    SELECT COUNT(*) INTO in_use FROM families
     WHERE billing_name IS NOT NULL
        OR billing_email IS NOT NULL
        OR billing_attention_to IS NOT NULL
        OR billing_address IS NOT NULL;
    IF in_use > 0 THEN
        RAISE EXCEPTION
            '0007 preflight: % families have billing_* data on the family row. Move it to the appropriate parent row before applying this migration.',
            in_use;
    END IF;
END $$;

ALTER TABLE parents
    ADD COLUMN is_billing_contact   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN billing_address      TEXT,
    ADD COLUMN billing_attention_to TEXT;

-- At most one billing contact per family. Mirrors the partial UNIQUE
-- on is_primary_contact added in 0004; the same demote-others pattern
-- in the routes covers the "promoting a new billing contact" case.
CREATE UNIQUE INDEX parents_one_billing_per_family
    ON parents (family_id)
 WHERE is_billing_contact;

-- Drop the family-level overrides.
ALTER TABLE families
    DROP COLUMN billing_name,
    DROP COLUMN billing_email,
    DROP COLUMN billing_attention_to,
    DROP COLUMN billing_address;
