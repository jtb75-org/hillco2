-- 0006: learning_supports table — 504 plans and IEPs.
--
-- The other half of the audit-driven records layer (agreements covered
-- engagement-scoped legal artifacts in 0005). 504s and IEPs are
-- school-issued per-student records — different audience, different
-- review cadence (504s annual, IEPs every 1-3 years per state law),
-- different ownership (the school produces them) — so they get their
-- own table rather than sharing one with agreements.

CREATE TYPE learning_support_type AS ENUM (
    'plan_504',         -- "504 plan" (Postgres enum values can't lead with a digit)
    'iep'
);

CREATE TYPE learning_support_status AS ENUM (
    'active',
    'expired',
    'terminated'
);

ALTER TYPE document_owner_type ADD VALUE IF NOT EXISTS 'learning_support';

CREATE TABLE learning_supports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    -- The school that issued this support. Nullable because we sometimes
    -- get records before the school is in our system; ON DELETE SET NULL
    -- so a school removal doesn't cascade-destroy student record history.
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    type learning_support_type NOT NULL,
    status learning_support_status NOT NULL DEFAULT 'active',
    -- Date the plan/IEP took effect; review_date is the next mandated
    -- review (annual for 504s, up to 3 years for IEPs); expires_at is
    -- the explicit end-of-validity if applicable.
    effective_date DATE,
    review_date DATE,
    expires_at DATE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active record per (student, type). A student can have an active
-- 504 AND an active IEP simultaneously (different programs); they
-- can't have two active 504s. School transfers expire the old record
-- and start a new one.
CREATE UNIQUE INDEX learning_supports_one_active_per_type
    ON learning_supports (student_id, type)
 WHERE status = 'active';

CREATE INDEX learning_supports_student_idx ON learning_supports (student_id);
CREATE INDEX learning_supports_school_idx  ON learning_supports (school_id);
CREATE INDEX learning_supports_review_idx
    ON learning_supports (review_date)
 WHERE status = 'active';

CREATE TRIGGER learning_supports_set_updated_at
    BEFORE UPDATE ON learning_supports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER learning_supports_audit
    AFTER INSERT OR UPDATE OR DELETE ON learning_supports
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
