-- Consolidated baseline schema for hillco2.
--
-- This file supersedes the original 0001_baseline + 12 follow-up
-- migrations (0002 through 0013) that built up the people-spine
-- restructure in stages. With no production data worth preserving,
-- collapsing the migration history into one baseline keeps fresh
-- deploys fast and the migration log readable; the design history
-- still lives in git via the original PRs.
--
-- Generated from a fresh PG16 instance after running 0001-0012 and
-- the manual drop of the legacy parents/students/contacts/users
-- tables. pg_dump output cleaned up for diffability; functions and
-- triggers in this file are the post-0012 versions.
--
-- The application sets `app.user_id` per request via SET LOCAL so
-- the audit_trigger can attribute writes; current_app_user_id() and
-- audit_trigger() handle row_id via COALESCE(id, person_id) so
-- tables keyed on person_id (auth) get a usable audit row.

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;



CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;



CREATE TYPE public.agreement_status AS ENUM (
    'draft',
    'active',
    'superseded',
    'expired',
    'terminated'
);



CREATE TYPE public.agreement_type AS ENUM (
    'services_contract',
    'medical_release'
);



CREATE TYPE public.auth_provider AS ENUM (
    'google',
    'native'
);



CREATE TYPE public.auth_status AS ENUM (
    'invited',
    'active',
    'suspended'
);



CREATE TYPE public.catalog_scope AS ENUM (
    'assessment',
    'placement'
);



CREATE TYPE public.communication_direction AS ENUM (
    'in',
    'out'
);



CREATE TYPE public.document_kind AS ENUM (
    'intake',
    'iep',
    'evaluation',
    'report_card',
    'medical',
    'recommendation',
    'invoice',
    'receipt',
    'scorecard',
    'other'
);



CREATE TYPE public.document_owner_type AS ENUM (
    'engagement',
    'student',
    'note',
    'family',
    'school',
    'contact',
    'agreement',
    'learning_support'
);



CREATE TYPE public.engagement_status AS ENUM (
    'in_progress',
    'on_hold',
    'completed',
    'cancelled'
);



CREATE TYPE public.engagement_type AS ENUM (
    'assessment',
    'full_placement'
);



CREATE TYPE public.followup_status AS ENUM (
    'open',
    'done',
    'cancelled'
);



CREATE TYPE public.invoice_line_source AS ENUM (
    'time',
    'expense',
    'custom'
);



CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'sent',
    'paid',
    'overdue',
    'void'
);



CREATE TYPE public.learning_support_status AS ENUM (
    'active',
    'expired',
    'terminated'
);



CREATE TYPE public.learning_support_type AS ENUM (
    'plan_504',
    'iep'
);



CREATE TYPE public.note_kind AS ENUM (
    'parent_intake',
    'student_interview',
    'second_parent',
    'school_visit',
    'call',
    'followup',
    'general'
);



CREATE TYPE public.owner_role AS ENUM (
    'consultant',
    'assistant',
    'both'
);



CREATE TYPE public.parent_role AS ENUM (
    'mom',
    'dad',
    'guardian',
    'other'
);



CREATE TYPE public.person_kind AS ENUM (
    'guardian',
    'student',
    'school_worker',
    'other'
);



CREATE TYPE public.school_recommendation_status AS ENUM (
    'recommended',
    'considered',
    'rejected',
    'applied',
    'accepted',
    'enrolled'
);



CREATE TYPE public.task_status AS ENUM (
    'not_started',
    'in_progress',
    'completed',
    'blocked',
    'not_applicable'
);



CREATE FUNCTION public.audit_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
    uid UUID := current_app_user_id();
    rid UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        rid := COALESCE(
            (to_jsonb(OLD)->>'id')::UUID,
            (to_jsonb(OLD)->>'person_id')::UUID
        );
        INSERT INTO audit_log(user_id, table_name, row_id, action, before_json, after_json)
        VALUES (uid, TG_TABLE_NAME, rid, 'DELETE', to_jsonb(OLD), NULL);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        rid := COALESCE(
            (to_jsonb(NEW)->>'id')::UUID,
            (to_jsonb(NEW)->>'person_id')::UUID
        );
        INSERT INTO audit_log(user_id, table_name, row_id, action, before_json, after_json)
        VALUES (uid, TG_TABLE_NAME, rid, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        rid := COALESCE(
            (to_jsonb(NEW)->>'id')::UUID,
            (to_jsonb(NEW)->>'person_id')::UUID
        );
        INSERT INTO audit_log(user_id, table_name, row_id, action, before_json, after_json)
        VALUES (uid, TG_TABLE_NAME, rid, 'INSERT', NULL, to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;



CREATE FUNCTION public.current_app_user_id() RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
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
$$;



CREATE FUNCTION public.next_contract_number() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
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
$$;



CREATE FUNCTION public.next_invoice_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    yr INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
    seq INTEGER;
BEGIN
    INSERT INTO invoice_sequence(year, last_seq) VALUES (yr, 1)
    ON CONFLICT (year) DO UPDATE SET last_seq = invoice_sequence.last_seq + 1
    RETURNING last_seq INTO seq;
    RETURN format('HC-%s-%s', yr, lpad(seq::text, 4, '0'));
END;
$$;



CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;


CREATE TABLE public.agreement_sequence (
    year integer NOT NULL,
    last_seq integer DEFAULT 0 NOT NULL
);



CREATE TABLE public.agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    type public.agreement_type NOT NULL,
    status public.agreement_status DEFAULT 'draft'::public.agreement_status NOT NULL,
    contract_number text,
    amount numeric(12,2),
    signed_at date,
    effective_date date,
    expires_at date,
    supersedes_id uuid,
    document_id uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    table_name text NOT NULL,
    row_id uuid,
    action text NOT NULL,
    before_json jsonb,
    after_json jsonb
);



CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;



CREATE TABLE public.auth (
    person_id uuid NOT NULL,
    status public.auth_status DEFAULT 'active'::public.auth_status NOT NULL,
    app_role text DEFAULT 'consultant'::text NOT NULL,
    invited_at timestamp with time zone,
    invited_by uuid,
    invite_token text,
    invite_expires_at timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.auth_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    person_id uuid NOT NULL,
    provider public.auth_provider NOT NULL,
    provider_subject text,
    password_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.catalog_phases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope public.catalog_scope NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    title text NOT NULL,
    description text,
    est_hours numeric(5,2),
    default_billable boolean DEFAULT true NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.communications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    direction public.communication_direction NOT NULL,
    occurred_on timestamp with time zone NOT NULL,
    subject text,
    from_addr text,
    to_addrs text,
    cc_addrs text,
    body text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_type public.document_owner_type NOT NULL,
    owner_id uuid NOT NULL,
    kind public.document_kind DEFAULT 'other'::public.document_kind NOT NULL,
    filename text NOT NULL,
    content_type text,
    byte_size bigint,
    s3_key text NOT NULL,
    uploaded_by uuid,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.engagements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family_id uuid NOT NULL,
    engagement_type public.engagement_type DEFAULT 'assessment'::public.engagement_type NOT NULL,
    status public.engagement_status DEFAULT 'in_progress'::public.engagement_status NOT NULL,
    start_date date,
    target_end_date date,
    default_hourly_rate numeric(12,2),
    lead_consultant_id uuid NOT NULL,
    notes text,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    student_id uuid NOT NULL
);



CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    user_id uuid,
    expense_date date NOT NULL,
    amount numeric(12,2) NOT NULL,
    category text,
    description text,
    billable boolean DEFAULT true NOT NULL,
    receipt_doc_id uuid,
    invoice_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric))
);



CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number text NOT NULL,
    engagement_id uuid NOT NULL,
    status public.invoice_status DEFAULT 'draft'::public.invoice_status NOT NULL,
    issue_date date,
    due_date date,
    sent_at timestamp with time zone,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    tax numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    paid_date date,
    paid_amount numeric(12,2),
    notes text,
    pdf_s3_key text,
    deleted_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    work_date date NOT NULL,
    hours numeric(5,2) NOT NULL,
    description text,
    billable boolean DEFAULT true NOT NULL,
    hourly_rate numeric(12,2),
    invoice_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT time_entries_hours_check CHECK ((hours > (0)::numeric))
);



CREATE VIEW public.engagement_financial_summary AS
 SELECT e.id AS engagement_id,
    e.family_id,
    ( SELECT a.amount
           FROM public.agreements a
          WHERE ((a.engagement_id = e.id) AND (a.type = 'services_contract'::public.agreement_type) AND (a.status = 'active'::public.agreement_status))
         LIMIT 1) AS package_fee,
    e.default_hourly_rate,
    COALESCE(t.billable_hours, (0)::numeric) AS billable_hours,
    COALESCE(t.nonbillable_hours, (0)::numeric) AS nonbillable_hours,
    COALESCE(t.billable_hours_value, (0)::numeric) AS billable_hours_value,
    COALESCE(t.uninvoiced_hours_value, (0)::numeric) AS uninvoiced_hours_value,
    COALESCE(x.billable_expenses, (0)::numeric) AS billable_expenses,
    COALESCE(x.nonbillable_expenses, (0)::numeric) AS nonbillable_expenses,
    COALESCE(x.uninvoiced_expenses, (0)::numeric) AS uninvoiced_expenses,
    (COALESCE(t.uninvoiced_hours_value, (0)::numeric) + COALESCE(x.uninvoiced_expenses, (0)::numeric)) AS uninvoiced_total,
    COALESCE(i.billed_total, (0)::numeric) AS billed_total,
    COALESCE(i.paid_total, (0)::numeric) AS paid_total,
    COALESCE(i.outstanding_balance, (0)::numeric) AS outstanding_balance
   FROM (((public.engagements e
     LEFT JOIN LATERAL ( SELECT sum(time_entries.hours) FILTER (WHERE time_entries.billable) AS billable_hours,
            sum(time_entries.hours) FILTER (WHERE (NOT time_entries.billable)) AS nonbillable_hours,
            sum((time_entries.hours * COALESCE(time_entries.hourly_rate, e.default_hourly_rate, (0)::numeric))) FILTER (WHERE time_entries.billable) AS billable_hours_value,
            sum((time_entries.hours * COALESCE(time_entries.hourly_rate, e.default_hourly_rate, (0)::numeric))) FILTER (WHERE (time_entries.billable AND (time_entries.invoice_id IS NULL))) AS uninvoiced_hours_value
           FROM public.time_entries
          WHERE (time_entries.engagement_id = e.id)) t ON (true))
     LEFT JOIN LATERAL ( SELECT sum(expenses.amount) FILTER (WHERE expenses.billable) AS billable_expenses,
            sum(expenses.amount) FILTER (WHERE (NOT expenses.billable)) AS nonbillable_expenses,
            sum(expenses.amount) FILTER (WHERE (expenses.billable AND (expenses.invoice_id IS NULL))) AS uninvoiced_expenses
           FROM public.expenses
          WHERE ((expenses.engagement_id = e.id) AND (expenses.invoice_id IS NULL))) x ON (true))
     LEFT JOIN LATERAL ( SELECT sum(invoices.total) FILTER (WHERE (invoices.status = ANY (ARRAY['sent'::public.invoice_status, 'paid'::public.invoice_status, 'overdue'::public.invoice_status]))) AS billed_total,
            sum(invoices.paid_amount) FILTER (WHERE (invoices.status = 'paid'::public.invoice_status)) AS paid_total,
            sum((invoices.total - COALESCE(invoices.paid_amount, (0)::numeric))) FILTER (WHERE (invoices.status = ANY (ARRAY['sent'::public.invoice_status, 'overdue'::public.invoice_status]))) AS outstanding_balance
           FROM public.invoices
          WHERE ((invoices.engagement_id = e.id) AND (invoices.deleted_at IS NULL))) i ON (true))
  WHERE (e.deleted_at IS NULL);



CREATE TABLE public.engagement_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    kind text NOT NULL,
    value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.engagement_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    service_item_id uuid,
    phase_id uuid,
    title text NOT NULL,
    description text,
    status public.task_status DEFAULT 'not_started'::public.task_status NOT NULL,
    assignee_id uuid,
    est_hours numeric(5,2),
    actual_hours numeric(5,2),
    billable boolean DEFAULT true NOT NULL,
    deliverable text,
    owner_role public.owner_role,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    completed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    household_name text NOT NULL,
    notes text,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.family_guardians (
    family_id uuid NOT NULL,
    person_id uuid NOT NULL,
    relationship public.parent_role DEFAULT 'other'::public.parent_role NOT NULL,
    is_primary_contact boolean DEFAULT false NOT NULL,
    is_billing_contact boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.family_students (
    family_id uuid NOT NULL,
    person_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    due_date date NOT NULL,
    assignee_id uuid,
    status public.followup_status DEFAULT 'open'::public.followup_status NOT NULL,
    completed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    description text NOT NULL,
    quantity numeric(12,2) DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) DEFAULT 0 NOT NULL,
    line_total numeric(12,2) DEFAULT 0 NOT NULL,
    source_type public.invoice_line_source,
    source_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.invoice_sequence (
    year integer NOT NULL,
    last_seq integer DEFAULT 0 NOT NULL
);



CREATE TABLE public.learning_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    strengths text,
    challenges text,
    accommodations_needed text,
    services_needed text,
    summary text,
    finalized_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.learning_supports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    school_id uuid,
    type public.learning_support_type NOT NULL,
    status public.learning_support_status DEFAULT 'active'::public.learning_support_status NOT NULL,
    effective_date date,
    review_date date,
    expires_at date,
    document_id uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    kind public.note_kind DEFAULT 'general'::public.note_kind NOT NULL,
    occurred_on date NOT NULL,
    title text,
    body text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.people (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind public.person_kind NOT NULL,
    first_name text NOT NULL,
    last_name text,
    email public.citext,
    phone text,
    birthday date,
    street1 text,
    street2 text,
    city text,
    state text,
    postal_code text,
    country text,
    billing_street1 text,
    billing_street2 text,
    billing_city text,
    billing_state text,
    billing_postal_code text,
    billing_country text,
    notes text,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    billing_attention_to text
);



CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    pdf_s3_key text,
    source_html text,
    generated_by uuid,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.school_recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    school_id uuid NOT NULL,
    rank integer,
    status public.school_recommendation_status DEFAULT 'considered'::public.school_recommendation_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.school_visit_attendees (
    school_visit_id uuid NOT NULL,
    contact_id uuid NOT NULL
);



CREATE TABLE public.school_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    school_id uuid NOT NULL,
    visit_date date NOT NULL,
    attendees text,
    facts_notes text,
    opinion_notes text,
    scorecard jsonb,
    hours numeric(5,2),
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.school_worker_details (
    person_id uuid NOT NULL,
    school_id uuid NOT NULL,
    role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.schools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location text,
    school_type text,
    grade_range_low text,
    grade_range_high text,
    website text,
    fit_profile text,
    notes text,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.service_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phase_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    default_est_hours numeric(5,2),
    default_billable boolean DEFAULT true NOT NULL,
    default_deliverable text,
    default_owner_role public.owner_role,
    sort_order integer DEFAULT 0 NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



CREATE TABLE public.student_details (
    person_id uuid NOT NULL,
    current_school_id uuid,
    current_grade text,
    has_504 boolean DEFAULT false NOT NULL,
    has_iep boolean DEFAULT false NOT NULL,
    has_learning_disability boolean DEFAULT false NOT NULL,
    autism_level smallint,
    has_adhd boolean DEFAULT false NOT NULL,
    has_intellectual_disability boolean DEFAULT false NOT NULL,
    has_health_impairment boolean DEFAULT false NOT NULL,
    has_emotional_disturbance boolean DEFAULT false NOT NULL,
    diagnosis_other text,
    needs_goals text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_details_autism_level_check CHECK (((autism_level >= 1) AND (autism_level <= 3)))
);



ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);



ALTER TABLE ONLY public.agreement_sequence
    ADD CONSTRAINT agreement_sequence_pkey PRIMARY KEY (year);



ALTER TABLE ONLY public.agreements
    ADD CONSTRAINT agreements_contract_number_key UNIQUE (contract_number);



ALTER TABLE ONLY public.agreements
    ADD CONSTRAINT agreements_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_provider_provider_subject_key UNIQUE (provider, provider_subject);



ALTER TABLE ONLY public.auth
    ADD CONSTRAINT auth_pkey PRIMARY KEY (person_id);



ALTER TABLE ONLY public.catalog_phases
    ADD CONSTRAINT catalog_phases_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_s3_key_key UNIQUE (s3_key);



ALTER TABLE ONLY public.engagement_requirements
    ADD CONSTRAINT engagement_requirements_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.engagement_tasks
    ADD CONSTRAINT engagement_tasks_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.families
    ADD CONSTRAINT families_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.family_guardians
    ADD CONSTRAINT family_guardians_pkey PRIMARY KEY (family_id, person_id);



ALTER TABLE ONLY public.family_students
    ADD CONSTRAINT family_students_pkey PRIMARY KEY (family_id, person_id);



ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.invoice_sequence
    ADD CONSTRAINT invoice_sequence_pkey PRIMARY KEY (year);



ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);



ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.learning_profiles
    ADD CONSTRAINT learning_profiles_engagement_id_key UNIQUE (engagement_id);



ALTER TABLE ONLY public.learning_profiles
    ADD CONSTRAINT learning_profiles_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.learning_supports
    ADD CONSTRAINT learning_supports_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.school_recommendations
    ADD CONSTRAINT school_recommendations_engagement_id_school_id_key UNIQUE (engagement_id, school_id);



ALTER TABLE ONLY public.school_recommendations
    ADD CONSTRAINT school_recommendations_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.school_visit_attendees
    ADD CONSTRAINT school_visit_attendees_pkey PRIMARY KEY (school_visit_id, contact_id);



ALTER TABLE ONLY public.school_visits
    ADD CONSTRAINT school_visits_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.school_worker_details
    ADD CONSTRAINT school_worker_details_pkey PRIMARY KEY (person_id);



ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_pkey PRIMARY KEY (id);



ALTER TABLE ONLY public.student_details
    ADD CONSTRAINT student_details_pkey PRIMARY KEY (person_id);



ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (id);



CREATE INDEX agreements_engagement_idx ON public.agreements USING btree (engagement_id);



CREATE INDEX agreements_expires_idx ON public.agreements USING btree (expires_at) WHERE (status = 'active'::public.agreement_status);



CREATE UNIQUE INDEX agreements_one_active_per_type ON public.agreements USING btree (engagement_id, type) WHERE (status = 'active'::public.agreement_status);



CREATE INDEX agreements_status_idx ON public.agreements USING btree (status);



CREATE INDEX audit_log_table_row_idx ON public.audit_log USING btree (table_name, row_id);



CREATE INDEX audit_log_ts_idx ON public.audit_log USING btree (ts DESC);



CREATE INDEX audit_log_user_id_idx ON public.audit_log USING btree (user_id);



CREATE INDEX auth_identities_person_idx ON public.auth_identities USING btree (person_id);



CREATE INDEX auth_status_idx ON public.auth USING btree (status);



CREATE INDEX catalog_phases_active_idx ON public.catalog_phases USING btree (id) WHERE (deleted_at IS NULL);



CREATE INDEX catalog_phases_scope_idx ON public.catalog_phases USING btree (scope, sort_order);



CREATE INDEX communications_engagement_id_idx ON public.communications USING btree (engagement_id);



CREATE INDEX communications_occurred_on_idx ON public.communications USING btree (occurred_on DESC);



CREATE INDEX documents_active_idx ON public.documents USING btree (id) WHERE (deleted_at IS NULL);



CREATE INDEX documents_owner_idx ON public.documents USING btree (owner_type, owner_id);



CREATE INDEX engagement_requirements_engagement_idx ON public.engagement_requirements USING btree (engagement_id);



CREATE INDEX engagement_requirements_kind_idx ON public.engagement_requirements USING btree (engagement_id, kind);



CREATE INDEX engagement_tasks_engagement_idx ON public.engagement_tasks USING btree (engagement_id);



CREATE INDEX engagement_tasks_phase_idx ON public.engagement_tasks USING btree (engagement_id, phase_id, sort_order);



CREATE INDEX engagement_tasks_status_idx ON public.engagement_tasks USING btree (status);



CREATE INDEX engagements_active_idx ON public.engagements USING btree (id) WHERE (deleted_at IS NULL);



CREATE INDEX engagements_family_id_idx ON public.engagements USING btree (family_id);



CREATE INDEX engagements_lead_consultant_idx ON public.engagements USING btree (lead_consultant_id);



CREATE INDEX engagements_status_idx ON public.engagements USING btree (status);



CREATE INDEX engagements_student_active_idx ON public.engagements USING btree (student_id) WHERE (deleted_at IS NULL);



CREATE INDEX expenses_engagement_id_idx ON public.expenses USING btree (engagement_id);



CREATE INDEX expenses_invoice_id_idx ON public.expenses USING btree (invoice_id);



CREATE INDEX expenses_unbilled_idx ON public.expenses USING btree (engagement_id) WHERE ((invoice_id IS NULL) AND (billable = true));



CREATE INDEX families_active_idx ON public.families USING btree (id) WHERE (deleted_at IS NULL);



CREATE INDEX families_household_name_idx ON public.families USING btree (household_name);



CREATE UNIQUE INDEX family_guardians_one_billing_per_family ON public.family_guardians USING btree (family_id) WHERE is_billing_contact;



CREATE UNIQUE INDEX family_guardians_one_primary_per_family ON public.family_guardians USING btree (family_id) WHERE is_primary_contact;



CREATE INDEX family_guardians_person_idx ON public.family_guardians USING btree (person_id);



CREATE INDEX family_students_person_idx ON public.family_students USING btree (person_id);



CREATE INDEX followups_engagement_id_idx ON public.followups USING btree (engagement_id);



CREATE INDEX followups_open_assignee_idx ON public.followups USING btree (assignee_id) WHERE (status = 'open'::public.followup_status);



CREATE INDEX followups_open_due_idx ON public.followups USING btree (due_date) WHERE (status = 'open'::public.followup_status);



CREATE INDEX invoice_line_items_invoice_id_idx ON public.invoice_line_items USING btree (invoice_id);



CREATE INDEX invoice_line_items_source_idx ON public.invoice_line_items USING btree (source_type, source_id);



CREATE INDEX invoices_active_idx ON public.invoices USING btree (id) WHERE (deleted_at IS NULL);



CREATE INDEX invoices_engagement_id_idx ON public.invoices USING btree (engagement_id);



CREATE INDEX invoices_status_idx ON public.invoices USING btree (status);



CREATE INDEX learning_profiles_engagement_idx ON public.learning_profiles USING btree (engagement_id);



CREATE UNIQUE INDEX learning_supports_one_active_per_type ON public.learning_supports USING btree (student_id, type) WHERE (status = 'active'::public.learning_support_status);



CREATE INDEX learning_supports_review_idx ON public.learning_supports USING btree (review_date) WHERE (status = 'active'::public.learning_support_status);



CREATE INDEX learning_supports_school_idx ON public.learning_supports USING btree (school_id);



CREATE INDEX learning_supports_student_idx ON public.learning_supports USING btree (student_id);



CREATE INDEX notes_engagement_id_idx ON public.notes USING btree (engagement_id);



CREATE INDEX notes_occurred_on_idx ON public.notes USING btree (occurred_on DESC);



CREATE INDEX people_active_idx ON public.people USING btree (id) WHERE (deleted_at IS NULL);



CREATE INDEX people_email_idx ON public.people USING btree (email) WHERE (email IS NOT NULL);



CREATE INDEX people_kind_idx ON public.people USING btree (kind);



CREATE INDEX people_name_idx ON public.people USING btree (last_name, first_name);



CREATE INDEX reports_engagement_id_idx ON public.reports USING btree (engagement_id);



CREATE INDEX school_recommendations_engagement_idx ON public.school_recommendations USING btree (engagement_id);



CREATE INDEX school_recommendations_school_idx ON public.school_recommendations USING btree (school_id);



CREATE INDEX school_visit_attendees_contact_idx ON public.school_visit_attendees USING btree (contact_id);



CREATE INDEX school_visits_date_idx ON public.school_visits USING btree (visit_date DESC);



CREATE INDEX school_visits_engagement_id_idx ON public.school_visits USING btree (engagement_id);



CREATE INDEX school_visits_school_id_idx ON public.school_visits USING btree (school_id);



CREATE INDEX school_worker_details_school_idx ON public.school_worker_details USING btree (school_id);



CREATE INDEX schools_active_idx ON public.schools USING btree (id) WHERE (deleted_at IS NULL);



CREATE INDEX schools_name_idx ON public.schools USING btree (name);



CREATE INDEX service_items_active_idx ON public.service_items USING btree (id) WHERE (deleted_at IS NULL);



CREATE INDEX service_items_phase_idx ON public.service_items USING btree (phase_id, sort_order);



CREATE INDEX student_details_school_idx ON public.student_details USING btree (current_school_id);



CREATE INDEX time_entries_engagement_id_idx ON public.time_entries USING btree (engagement_id);



CREATE INDEX time_entries_invoice_id_idx ON public.time_entries USING btree (invoice_id);



CREATE INDEX time_entries_unbilled_idx ON public.time_entries USING btree (engagement_id) WHERE ((invoice_id IS NULL) AND (billable = true));



CREATE INDEX time_entries_user_id_idx ON public.time_entries USING btree (user_id);



CREATE TRIGGER agreements_audit AFTER INSERT OR DELETE OR UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER agreements_set_updated_at BEFORE UPDATE ON public.agreements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER auth_audit AFTER INSERT OR DELETE OR UPDATE ON public.auth FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER auth_identities_audit AFTER INSERT OR DELETE OR UPDATE ON public.auth_identities FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER auth_set_updated_at BEFORE UPDATE ON public.auth FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER catalog_phases_audit AFTER INSERT OR DELETE OR UPDATE ON public.catalog_phases FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER catalog_phases_set_updated_at BEFORE UPDATE ON public.catalog_phases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER communications_audit AFTER INSERT OR DELETE OR UPDATE ON public.communications FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER communications_set_updated_at BEFORE UPDATE ON public.communications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER documents_audit AFTER INSERT OR DELETE OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER documents_set_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER engagement_requirements_audit AFTER INSERT OR DELETE OR UPDATE ON public.engagement_requirements FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER engagement_requirements_set_updated_at BEFORE UPDATE ON public.engagement_requirements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER engagement_tasks_audit AFTER INSERT OR DELETE OR UPDATE ON public.engagement_tasks FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER engagement_tasks_set_updated_at BEFORE UPDATE ON public.engagement_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER engagements_audit AFTER INSERT OR DELETE OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER engagements_set_updated_at BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER expenses_audit AFTER INSERT OR DELETE OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER families_audit AFTER INSERT OR DELETE OR UPDATE ON public.families FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER families_set_updated_at BEFORE UPDATE ON public.families FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER family_guardians_audit AFTER INSERT OR DELETE OR UPDATE ON public.family_guardians FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER family_guardians_set_updated_at BEFORE UPDATE ON public.family_guardians FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER family_students_audit AFTER INSERT OR DELETE OR UPDATE ON public.family_students FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER followups_audit AFTER INSERT OR DELETE OR UPDATE ON public.followups FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER followups_set_updated_at BEFORE UPDATE ON public.followups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER invoice_line_items_audit AFTER INSERT OR DELETE OR UPDATE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER invoice_line_items_set_updated_at BEFORE UPDATE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER invoices_audit AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER learning_profiles_audit AFTER INSERT OR DELETE OR UPDATE ON public.learning_profiles FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER learning_profiles_set_updated_at BEFORE UPDATE ON public.learning_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER learning_supports_audit AFTER INSERT OR DELETE OR UPDATE ON public.learning_supports FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER learning_supports_set_updated_at BEFORE UPDATE ON public.learning_supports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER notes_audit AFTER INSERT OR DELETE OR UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER notes_set_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER people_audit AFTER INSERT OR DELETE OR UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER people_set_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER reports_audit AFTER INSERT OR DELETE OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER school_recommendations_audit AFTER INSERT OR DELETE OR UPDATE ON public.school_recommendations FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER school_recommendations_set_updated_at BEFORE UPDATE ON public.school_recommendations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER school_visits_audit AFTER INSERT OR DELETE OR UPDATE ON public.school_visits FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER school_visits_set_updated_at BEFORE UPDATE ON public.school_visits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER school_worker_details_audit AFTER INSERT OR DELETE OR UPDATE ON public.school_worker_details FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER school_worker_details_set_updated_at BEFORE UPDATE ON public.school_worker_details FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER schools_audit AFTER INSERT OR DELETE OR UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER schools_set_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER service_items_audit AFTER INSERT OR DELETE OR UPDATE ON public.service_items FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER service_items_set_updated_at BEFORE UPDATE ON public.service_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER student_details_audit AFTER INSERT OR DELETE OR UPDATE ON public.student_details FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER student_details_set_updated_at BEFORE UPDATE ON public.student_details FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



CREATE TRIGGER time_entries_audit AFTER INSERT OR DELETE OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();



CREATE TRIGGER time_entries_set_updated_at BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();



ALTER TABLE ONLY public.agreements
    ADD CONSTRAINT agreements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.agreements
    ADD CONSTRAINT agreements_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.agreements
    ADD CONSTRAINT agreements_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.agreements
    ADD CONSTRAINT agreements_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES public.agreements(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.auth_identities
    ADD CONSTRAINT auth_identities_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.auth(person_id) ON DELETE CASCADE;



ALTER TABLE ONLY public.auth
    ADD CONSTRAINT auth_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.auth
    ADD CONSTRAINT auth_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.engagement_requirements
    ADD CONSTRAINT engagement_requirements_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.engagement_tasks
    ADD CONSTRAINT engagement_tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.engagement_tasks
    ADD CONSTRAINT engagement_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.engagement_tasks
    ADD CONSTRAINT engagement_tasks_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.engagement_tasks
    ADD CONSTRAINT engagement_tasks_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.catalog_phases(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.engagement_tasks
    ADD CONSTRAINT engagement_tasks_service_item_id_fkey FOREIGN KEY (service_item_id) REFERENCES public.service_items(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_lead_consultant_id_fkey FOREIGN KEY (lead_consultant_id) REFERENCES public.people(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.people(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_receipt_doc_fk FOREIGN KEY (receipt_doc_id) REFERENCES public.documents(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.family_guardians
    ADD CONSTRAINT family_guardians_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.family_guardians
    ADD CONSTRAINT family_guardians_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.family_students
    ADD CONSTRAINT family_students_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.family_students
    ADD CONSTRAINT family_students_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.followups
    ADD CONSTRAINT followups_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.learning_profiles
    ADD CONSTRAINT learning_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.learning_profiles
    ADD CONSTRAINT learning_profiles_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.learning_supports
    ADD CONSTRAINT learning_supports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.learning_supports
    ADD CONSTRAINT learning_supports_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.learning_supports
    ADD CONSTRAINT learning_supports_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.learning_supports
    ADD CONSTRAINT learning_supports_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.people(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.school_recommendations
    ADD CONSTRAINT school_recommendations_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.school_recommendations
    ADD CONSTRAINT school_recommendations_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.school_visit_attendees
    ADD CONSTRAINT school_visit_attendees_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.people(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.school_visit_attendees
    ADD CONSTRAINT school_visit_attendees_school_visit_id_fkey FOREIGN KEY (school_visit_id) REFERENCES public.school_visits(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.school_visits
    ADD CONSTRAINT school_visits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.school_visits
    ADD CONSTRAINT school_visits_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.school_visits
    ADD CONSTRAINT school_visits_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.school_worker_details
    ADD CONSTRAINT school_worker_details_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.school_worker_details
    ADD CONSTRAINT school_worker_details_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES public.catalog_phases(id) ON DELETE RESTRICT;



ALTER TABLE ONLY public.student_details
    ADD CONSTRAINT student_details_current_school_id_fkey FOREIGN KEY (current_school_id) REFERENCES public.schools(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.student_details
    ADD CONSTRAINT student_details_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON DELETE CASCADE;



ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;



ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.people(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

