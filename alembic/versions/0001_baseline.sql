-- HillCo2 — initial schema
-- Single migration. All data tables get audit + updated_at triggers.
-- App must SET LOCAL app.user_id = '<id>' per request so audit_trigger can attribute writes.

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- Helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Pinned search_path so callers with restricted/empty search_path (notably
-- pg_dump-generated replay scripts that set search_path = '') still resolve
-- current_setting and the function lookup itself.
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS UUID
SET search_path = public, pg_catalog
AS $$
DECLARE
    v TEXT;
BEGIN
    v := current_setting('app.user_id', true);
    IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
    RETURN v::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID,
    table_name TEXT NOT NULL,
    row_id UUID,
    action TEXT NOT NULL,
    before_json JSONB,
    after_json JSONB
);
CREATE INDEX audit_log_table_row_idx ON audit_log(table_name, row_id);
CREATE INDEX audit_log_ts_idx ON audit_log(ts DESC);
CREATE INDEX audit_log_user_id_idx ON audit_log(user_id);

-- Pinned search_path so the unqualified current_app_user_id() and audit_log
-- references resolve under restricted/empty caller search_path.
CREATE OR REPLACE FUNCTION audit_trigger() RETURNS TRIGGER
SET search_path = public, pg_catalog
AS $$
DECLARE
    uid UUID := current_app_user_id();
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log(user_id, table_name, row_id, action, before_json, after_json)
        VALUES (uid, TG_TABLE_NAME, (to_jsonb(OLD)->>'id')::UUID, 'DELETE', to_jsonb(OLD), NULL);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log(user_id, table_name, row_id, action, before_json, after_json)
        VALUES (uid, TG_TABLE_NAME, (to_jsonb(NEW)->>'id')::UUID, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log(user_id, table_name, row_id, action, before_json, after_json)
        VALUES (uid, TG_TABLE_NAME, (to_jsonb(NEW)->>'id')::UUID, 'INSERT', NULL, to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Invoice numbering: HC-YYYY-NNNN, atomic, yearly reset
CREATE TABLE invoice_sequence (
    year INTEGER PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION next_invoice_number() RETURNS TEXT AS $$
DECLARE
    yr INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
    seq INTEGER;
BEGIN
    INSERT INTO invoice_sequence(year, last_seq) VALUES (yr, 1)
    ON CONFLICT (year) DO UPDATE SET last_seq = invoice_sequence.last_seq + 1
    RETURNING last_seq INTO seq;
    RETURN format('HC-%s-%s', yr, lpad(seq::text, 4, '0'));
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE engagement_type AS ENUM (
    'assessment','full_placement'
);
CREATE TYPE engagement_status AS ENUM (
    'in_progress','on_hold','completed','cancelled'
);
CREATE TYPE invoice_status AS ENUM (
    'draft','sent','paid','overdue','void'
);
CREATE TYPE followup_status AS ENUM ('open','done','cancelled');
CREATE TYPE note_kind AS ENUM (
    'parent_intake','student_interview','second_parent','school_visit','call','followup','general'
);
CREATE TYPE communication_direction AS ENUM ('in','out');
CREATE TYPE document_kind AS ENUM (
    'intake','iep','evaluation','report_card','medical','recommendation','invoice','receipt','scorecard','other'
);
CREATE TYPE document_owner_type AS ENUM ('engagement','student','note','family','school','contact');
CREATE TYPE school_recommendation_status AS ENUM (
    'recommended','considered','rejected','applied','accepted','enrolled'
);
CREATE TYPE parent_role AS ENUM ('mom','dad','guardian','other');
CREATE TYPE invoice_line_source AS ENUM ('time','expense','custom');
CREATE TYPE task_status AS ENUM (
    'not_started','in_progress','completed','blocked','not_applicable'
);
CREATE TYPE owner_role AS ENUM ('consultant','assistant','both');

-- Catalog scope decouples a phase from engagement_type so the 7 assessment
-- phases aren't duplicated under full_placement. An assessment engagement
-- shows phases WHERE scope = 'assessment'; a full_placement engagement
-- shows phases WHERE scope IN ('assessment','placement').
CREATE TYPE catalog_scope AS ENUM ('assessment','placement');

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'consultant',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_name TEXT NOT NULL,
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX families_household_name_idx ON families(household_name);
CREATE INDEX families_active_idx ON families(id) WHERE deleted_at IS NULL;

CREATE TABLE parents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email CITEXT,
    phone TEXT,
    role parent_role NOT NULL DEFAULT 'other',
    is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX parents_family_id_idx ON parents(family_id);

CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dob DATE,
    -- current_school_id FK to schools(id) added via ALTER below, since schools
    -- is declared further down the file.
    current_school_id UUID,
    current_grade TEXT,
    has_504 BOOLEAN NOT NULL DEFAULT FALSE,
    has_iep BOOLEAN NOT NULL DEFAULT FALSE,
    has_learning_disability BOOLEAN NOT NULL DEFAULT FALSE,
    -- NULL = no autism diagnosis. 1/2/3 = severity per the redesign doc
    -- (see hillco-portal/docs/notes/redesign). Replaces has_autism BOOLEAN
    -- so "diagnosed but level unknown" isn't representable — capture that
    -- via diagnosis_other if it ever comes up.
    autism_level SMALLINT CHECK (autism_level BETWEEN 1 AND 3),
    has_adhd BOOLEAN NOT NULL DEFAULT FALSE,
    has_intellectual_disability BOOLEAN NOT NULL DEFAULT FALSE,
    has_health_impairment BOOLEAN NOT NULL DEFAULT FALSE,
    has_emotional_disturbance BOOLEAN NOT NULL DEFAULT FALSE,
    diagnosis_other TEXT,
    needs_goals TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX students_family_id_idx ON students(family_id);
CREATE INDEX students_current_school_idx ON students(current_school_id);
CREATE INDEX students_active_idx ON students(id) WHERE deleted_at IS NULL;

CREATE TABLE engagements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
    engagement_type engagement_type NOT NULL DEFAULT 'assessment',
    status engagement_status NOT NULL DEFAULT 'in_progress',
    start_date DATE,
    target_end_date DATE,
    package_fee DECIMAL(12,2),
    default_hourly_rate DECIMAL(12,2),
    lead_consultant_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX engagements_family_id_idx ON engagements(family_id);
CREATE INDEX engagements_lead_consultant_idx ON engagements(lead_consultant_id);
CREATE INDEX engagements_status_idx ON engagements(status);
CREATE INDEX engagements_active_idx ON engagements(id) WHERE deleted_at IS NULL;

CREATE TABLE engagement_students (
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    PRIMARY KEY (engagement_id, student_id)
);

-- Engagement-level requirement constraints (Step 2 of Assessment in the
-- redesign doc: school budget, location, etc.). Modeled as a child table
-- so the set of `kind`s can grow without migrations; the app validates
-- known kinds.
CREATE TABLE engagement_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX engagement_requirements_engagement_idx ON engagement_requirements(engagement_id);
CREATE INDEX engagement_requirements_kind_idx ON engagement_requirements(engagement_id, kind);

CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    kind note_kind NOT NULL DEFAULT 'general',
    occurred_on DATE NOT NULL,
    title TEXT,
    body TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notes_engagement_id_idx ON notes(engagement_id);
CREATE INDEX notes_occurred_on_idx ON notes(occurred_on DESC);

CREATE TABLE followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    due_date DATE NOT NULL,
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status followup_status NOT NULL DEFAULT 'open',
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX followups_engagement_id_idx ON followups(engagement_id);
CREATE INDEX followups_open_due_idx ON followups(due_date) WHERE status = 'open';
CREATE INDEX followups_open_assignee_idx ON followups(assignee_id) WHERE status = 'open';

CREATE TABLE schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location TEXT,
    school_type TEXT,
    grade_range_low TEXT,
    grade_range_high TEXT,
    website TEXT,
    fit_profile TEXT,
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX schools_name_idx ON schools(name);
CREATE INDEX schools_active_idx ON schools(id) WHERE deleted_at IS NULL;

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT,
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    email CITEXT,
    phone TEXT,
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX contacts_school_id_idx ON contacts(school_id);
CREATE INDEX contacts_name_idx ON contacts(name);
CREATE INDEX contacts_active_idx ON contacts(id) WHERE deleted_at IS NULL;

CREATE TABLE school_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
    visit_date DATE NOT NULL,
    attendees TEXT,
    facts_notes TEXT,
    opinion_notes TEXT,
    scorecard JSONB,
    hours DECIMAL(5,2),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX school_visits_engagement_id_idx ON school_visits(engagement_id);
CREATE INDEX school_visits_school_id_idx ON school_visits(school_id);
CREATE INDEX school_visits_date_idx ON school_visits(visit_date DESC);

CREATE TABLE school_visit_attendees (
    school_visit_id UUID NOT NULL REFERENCES school_visits(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
    PRIMARY KEY (school_visit_id, contact_id)
);
CREATE INDEX school_visit_attendees_contact_idx ON school_visit_attendees(contact_id);

CREATE TABLE school_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
    rank INTEGER,
    status school_recommendation_status NOT NULL DEFAULT 'considered',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (engagement_id, school_id)
);
CREATE INDEX school_recommendations_engagement_idx ON school_recommendations(engagement_id);
CREATE INDEX school_recommendations_school_idx ON school_recommendations(school_id);

CREATE TABLE communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    direction communication_direction NOT NULL,
    occurred_on TIMESTAMPTZ NOT NULL,
    subject TEXT,
    from_addr TEXT,
    to_addrs TEXT,
    cc_addrs TEXT,
    body TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX communications_engagement_id_idx ON communications(engagement_id);
CREATE INDEX communications_occurred_on_idx ON communications(occurred_on DESC);

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT UNIQUE NOT NULL,
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE RESTRICT,
    status invoice_status NOT NULL DEFAULT 'draft',
    issue_date DATE,
    due_date DATE,
    sent_at TIMESTAMPTZ,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_date DATE,
    paid_amount DECIMAL(12,2),
    notes TEXT,
    pdf_s3_key TEXT,
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX invoices_engagement_id_idx ON invoices(engagement_id);
CREATE INDEX invoices_status_idx ON invoices(status);
CREATE INDEX invoices_active_idx ON invoices(id) WHERE deleted_at IS NULL;

CREATE TABLE invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    quantity DECIMAL(12,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
    source_type invoice_line_source,
    source_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX invoice_line_items_invoice_id_idx ON invoice_line_items(invoice_id);
CREATE INDEX invoice_line_items_source_idx ON invoice_line_items(source_type, source_id);

CREATE TABLE time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    work_date DATE NOT NULL,
    hours DECIMAL(5,2) NOT NULL CHECK (hours > 0),
    description TEXT,
    billable BOOLEAN NOT NULL DEFAULT TRUE,
    hourly_rate DECIMAL(12,2),
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX time_entries_engagement_id_idx ON time_entries(engagement_id);
CREATE INDEX time_entries_user_id_idx ON time_entries(user_id);
CREATE INDEX time_entries_invoice_id_idx ON time_entries(invoice_id);
CREATE INDEX time_entries_unbilled_idx ON time_entries(engagement_id)
    WHERE invoice_id IS NULL AND billable = TRUE;

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    expense_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    category TEXT,
    description TEXT,
    billable BOOLEAN NOT NULL DEFAULT TRUE,
    receipt_doc_id UUID,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX expenses_engagement_id_idx ON expenses(engagement_id);
CREATE INDEX expenses_invoice_id_idx ON expenses(invoice_id);
CREATE INDEX expenses_unbilled_idx ON expenses(engagement_id)
    WHERE invoice_id IS NULL AND billable = TRUE;

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    pdf_s3_key TEXT,
    source_html TEXT,
    generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX reports_engagement_id_idx ON reports(engagement_id);

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type document_owner_type NOT NULL,
    owner_id UUID NOT NULL,
    kind document_kind NOT NULL DEFAULT 'other',
    filename TEXT NOT NULL,
    content_type TEXT,
    byte_size BIGINT,
    s3_key TEXT NOT NULL UNIQUE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX documents_owner_idx ON documents(owner_type, owner_id);
CREATE INDEX documents_active_idx ON documents(id) WHERE deleted_at IS NULL;

-- Forward-FK fixups: students.current_school_id and expenses.receipt_doc_id
-- both point at tables declared after them in the file.
ALTER TABLE students
    ADD CONSTRAINT students_current_school_fk
    FOREIGN KEY (current_school_id) REFERENCES schools(id) ON DELETE SET NULL;

ALTER TABLE expenses
    ADD CONSTRAINT expenses_receipt_doc_fk
    FOREIGN KEY (receipt_doc_id) REFERENCES documents(id) ON DELETE SET NULL;

-- Catalog: phases group service items into named workflow steps. Each
-- phase has a scope ('assessment' | 'placement'); engagements show phases
-- whose scope matches their engagement_type — full_placement engagements
-- include both scopes, assessment engagements only the assessment scope.
CREATE TABLE catalog_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope catalog_scope NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    description TEXT,
    est_hours DECIMAL(5,2),
    default_billable BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX catalog_phases_scope_idx ON catalog_phases(scope, sort_order);
CREATE INDEX catalog_phases_active_idx ON catalog_phases(id) WHERE deleted_at IS NULL;

CREATE TABLE service_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID NOT NULL REFERENCES catalog_phases(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    description TEXT,
    default_est_hours DECIMAL(5,2),
    default_billable BOOLEAN NOT NULL DEFAULT TRUE,
    default_deliverable TEXT,
    default_owner_role owner_role,
    sort_order INTEGER NOT NULL DEFAULT 0,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX service_items_phase_idx ON service_items(phase_id, sort_order);
CREATE INDEX service_items_active_idx ON service_items(id) WHERE deleted_at IS NULL;

-- Tasks snapshot phase_id at creation so they stay grouped even if the
-- catalog item is later renamed or deleted (service_item_id is ON DELETE
-- SET NULL). NULL is allowed for ad-hoc tasks that don't belong to any
-- phase; the UI may default to the engagement's first phase.
CREATE TABLE engagement_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    service_item_id UUID REFERENCES service_items(id) ON DELETE SET NULL,
    phase_id UUID REFERENCES catalog_phases(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'not_started',
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    est_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    billable BOOLEAN NOT NULL DEFAULT TRUE,
    deliverable TEXT,
    owner_role owner_role,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX engagement_tasks_engagement_idx ON engagement_tasks(engagement_id);
CREATE INDEX engagement_tasks_status_idx ON engagement_tasks(status);
CREATE INDEX engagement_tasks_phase_idx ON engagement_tasks(engagement_id, phase_id, sort_order);

-- Learning profile (Assessment Step 5: profile synthesis). First-class
-- artifact rather than free text in notes/needs_goals so the app can
-- track a finalized state and surface it as a deliverable. Per-student
-- within an engagement.
CREATE TABLE learning_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    strengths TEXT,
    challenges TEXT,
    accommodations_needed TEXT,
    services_needed TEXT,
    summary TEXT,
    finalized_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (engagement_id, student_id)
);
CREATE INDEX learning_profiles_engagement_idx ON learning_profiles(engagement_id);
CREATE INDEX learning_profiles_student_idx ON learning_profiles(student_id);

-- ============================================================
-- Triggers (apply to all data tables; skip audit_log/invoice_sequence/M2M)
-- ============================================================

DO $$
DECLARE t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'users','families','parents','students','engagements',
        'engagement_requirements','notes','followups',
        'schools','contacts','school_visits','school_recommendations','communications',
        'invoices','invoice_line_items','time_entries','expenses','documents',
        'catalog_phases','service_items','engagement_tasks','learning_profiles'
    ]) LOOP
        EXECUTE format(
            'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t, t);
    END LOOP;

    FOR t IN SELECT unnest(ARRAY[
        'users','families','parents','students','engagements',
        'engagement_requirements','notes','followups',
        'schools','contacts','school_visits','school_recommendations','communications',
        'invoices','invoice_line_items','time_entries','expenses','reports','documents',
        'catalog_phases','service_items','engagement_tasks','learning_profiles'
    ]) LOOP
        EXECUTE format(
            'CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_trigger()',
            t, t);
    END LOOP;
END $$;

-- ============================================================
-- Views
-- ============================================================

CREATE OR REPLACE VIEW engagement_financial_summary AS
SELECT
    e.id AS engagement_id,
    e.family_id,
    e.package_fee,
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
