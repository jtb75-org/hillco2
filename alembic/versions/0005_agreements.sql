-- 0005: agreements table — services contracts and medical releases.
--
-- Per the schema-evolution review: contracts and medical releases are
-- engagement-scoped, parent-signed legal artifacts with a shared
-- lifecycle (signed/effective dates, expiry, status, attached PDF).
-- They get their own structured table; the polymorphic `documents`
-- table holds the file, and `agreements.document_id` references it
-- (app-layer validates ownership consistency — DB-level composite FK
-- against the polymorphic shape isn't expressible).
--
-- engagements.package_fee was the previous home for "how much do we
-- bill for this engagement." That responsibility now belongs on the
-- services_contract agreement (Joe's clarification: each engagement
-- has its own contract, twins get two contracts because services may
-- differ). package_fee data is migrated into a backfilled active
-- services_contract row before the column is dropped.

CREATE TYPE agreement_type AS ENUM (
    'services_contract',
    'medical_release'
);

-- Extend the documents.owner_type enum so PDFs can be owned by an
-- agreement directly (the route's app-layer ownership check requires
-- this value to exist). Postgres enum values are append-only without
-- IF NOT EXISTS handling here — first-time apply on the live cluster.
ALTER TYPE document_owner_type ADD VALUE IF NOT EXISTS 'agreement';

CREATE TYPE agreement_status AS ENUM (
    'draft',          -- being prepared, not yet signed
    'active',         -- signed and current
    'superseded',     -- replaced by a newer agreement (supersedes_id chain)
    'expired',        -- past expires_at, no replacement
    'terminated'      -- cancelled before expiry
);

-- Contract numbering, mirroring invoice_sequence. Yearly reset, atomic.
-- medical_release rows don't get a contract_number; the function is
-- only invoked by the route when type = 'services_contract'.
CREATE TABLE agreement_sequence (
    year INTEGER PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION next_contract_number() RETURNS TEXT
SET search_path = public, pg_catalog
AS $$
DECLARE
    yr INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
    seq INTEGER;
BEGIN
    INSERT INTO agreement_sequence(year, last_seq) VALUES (yr, 1)
    ON CONFLICT (year) DO UPDATE SET last_seq = agreement_sequence.last_seq + 1
    RETURNING last_seq INTO seq;
    RETURN format('SC-%s-%s', yr, lpad(seq::text, 4, '0'));
END;
$$ LANGUAGE plpgsql;

CREATE TABLE agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE RESTRICT,
    type agreement_type NOT NULL,
    status agreement_status NOT NULL DEFAULT 'draft',
    -- Only services_contract rows carry a number; medical_release stays NULL.
    -- UNIQUE so a number can't be reused even across different types.
    contract_number TEXT UNIQUE,
    -- amount is the binding contract amount for services_contract; NULL
    -- for medical_release. NUMERIC(12,2) matches invoices.subtotal scale.
    amount NUMERIC(12,2),
    signed_at DATE,
    effective_date DATE,
    expires_at DATE,
    -- Supersession chain: when a new contract replaces an old one, the
    -- old one's status flips to 'superseded' and the new one's
    -- supersedes_id points to it. Self-FK; ON DELETE SET NULL so a
    -- physical delete of an old draft (rare) doesn't break the chain.
    supersedes_id UUID REFERENCES agreements(id) ON DELETE SET NULL,
    -- Polymorphic doc reference (documents.owner_type would be
    -- 'agreement', owner_id = this row). App-layer validates the
    -- attached document's owner matches; DB FK on document_id keeps
    -- the basic referential integrity.
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active agreement per (engagement, type). draft can co-exist with
-- active — common during contract renegotiation. Superseded/expired/
-- terminated rows are history and don't constrain.
CREATE UNIQUE INDEX agreements_one_active_per_type
    ON agreements (engagement_id, type)
 WHERE status = 'active';

CREATE INDEX agreements_engagement_idx ON agreements (engagement_id);
CREATE INDEX agreements_status_idx ON agreements (status);
CREATE INDEX agreements_expires_idx ON agreements (expires_at) WHERE status = 'active';

-- Triggers: matches the pattern from 0001_baseline. agreement_sequence
-- is intentionally excluded — sequence increments are bookkeeping noise,
-- not audit-worthy events.
CREATE TRIGGER agreements_set_updated_at
    BEFORE UPDATE ON agreements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER agreements_audit
    AFTER INSERT OR UPDATE OR DELETE ON agreements
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ---- Backfill from engagements.package_fee, then drop the column.
--
-- engagement_financial_summary depends on the column, so the view goes
-- before the DROP and gets recreated below pointing at agreements.amount
-- (active services_contract row for the engagement).

INSERT INTO agreements (
    engagement_id, type, status, amount, effective_date, signed_at, created_by, notes
)
SELECT
    id,
    'services_contract',
    'active',
    package_fee,
    start_date,
    start_date,
    lead_consultant_id,
    'Backfilled from engagements.package_fee at migration 0005'
  FROM engagements
 WHERE package_fee IS NOT NULL
   AND deleted_at IS NULL;

DROP VIEW engagement_financial_summary;

ALTER TABLE engagements DROP COLUMN package_fee;

-- Recreate the view. package_fee column is gone, so the financial
-- summary now derives "contract amount" from the active
-- services_contract for the engagement (NULL if there isn't one yet,
-- matching the old NULL-package_fee behavior).
CREATE OR REPLACE VIEW engagement_financial_summary AS
SELECT
    e.id AS engagement_id,
    e.family_id,
    (SELECT a.amount FROM agreements a
      WHERE a.engagement_id = e.id
        AND a.type = 'services_contract'
        AND a.status = 'active'
      LIMIT 1) AS package_fee,
    e.default_hourly_rate,
    COALESCE(t.billable_hours, 0)         AS billable_hours,
    COALESCE(t.nonbillable_hours, 0)      AS nonbillable_hours,
    COALESCE(t.billable_hours_value, 0)   AS billable_hours_value,
    COALESCE(t.uninvoiced_hours_value, 0) AS uninvoiced_hours_value,
    COALESCE(x.billable_expenses, 0)      AS billable_expenses,
    COALESCE(x.nonbillable_expenses, 0)   AS nonbillable_expenses,
    COALESCE(x.uninvoiced_expenses, 0)    AS uninvoiced_expenses,
    COALESCE(t.uninvoiced_hours_value, 0) + COALESCE(x.uninvoiced_expenses, 0)
                                          AS uninvoiced_total,
    COALESCE(i.billed_total, 0)           AS billed_total,
    COALESCE(i.paid_total, 0)             AS paid_total,
    COALESCE(i.outstanding_balance, 0)    AS outstanding_balance
FROM engagements e
LEFT JOIN LATERAL (
    SELECT
        SUM(hours) FILTER (WHERE billable)        AS billable_hours,
        SUM(hours) FILTER (WHERE NOT billable)    AS nonbillable_hours,
        SUM(hours * COALESCE(hourly_rate, e.default_hourly_rate, 0))
            FILTER (WHERE billable)               AS billable_hours_value,
        SUM(hours * COALESCE(hourly_rate, e.default_hourly_rate, 0))
            FILTER (WHERE billable AND invoice_id IS NULL)
                                                  AS uninvoiced_hours_value
    FROM time_entries WHERE engagement_id = e.id
) t ON TRUE
LEFT JOIN LATERAL (
    SELECT
        SUM(amount) FILTER (WHERE billable)       AS billable_expenses,
        SUM(amount) FILTER (WHERE NOT billable)   AS nonbillable_expenses,
        SUM(amount) FILTER (WHERE billable AND invoice_id IS NULL)
                                                  AS uninvoiced_expenses
    FROM expenses WHERE engagement_id = e.id AND invoice_id IS NULL
) x ON TRUE
LEFT JOIN LATERAL (
    SELECT
        SUM(total) FILTER (WHERE status IN ('sent','paid','overdue'))         AS billed_total,
        SUM(paid_amount) FILTER (WHERE status = 'paid')                       AS paid_total,
        SUM(total - COALESCE(paid_amount,0)) FILTER (WHERE status IN ('sent','overdue'))
                                                                              AS outstanding_balance
    FROM invoices WHERE engagement_id = e.id AND deleted_at IS NULL
) i ON TRUE
WHERE e.deleted_at IS NULL;
