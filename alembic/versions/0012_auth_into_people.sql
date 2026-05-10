-- 0012: fold the `users` (auth) table into the people spine.
--
-- This is the auth half of the people-spine restructure. Today's
-- `users` table holds the consultant accounts that sign in via
-- Google OIDC; their data overlaps with `people` (name, email).
-- Joe's design unifies them: every human is a row in `people`,
-- with a 1:1 `auth` detail row for those granted portal access
-- and 1:N `auth_identities` rows for their identity providers.
--
-- This migration:
--   1. Backfills `people` from `users` (kind='other', id preserved)
--   2. Creates `auth` + `auth_identities` and backfills from `users`
--   3. Repoints every user_id-style FK in the schema to point at
--      people(id) instead of users(id)
--
-- The legacy `users` table is intentionally NOT dropped here — the
-- existing routes still query it for now. PR-3 (this PR) updates
-- those routes to read from auth + people; the table itself comes
-- out in PR-4 alongside parents/students/contacts.

-- ============================================================
-- 1. Backfill people from users (kind='other')
-- ============================================================

INSERT INTO people (
    id, kind, first_name, last_name, email,
    deleted_at, created_at, updated_at
)
SELECT
    u.id,
    'other'::person_kind,
    COALESCE(NULLIF(SPLIT_PART(u.name, ' ', 1), ''), u.name),
    NULLIF(TRIM(SUBSTRING(u.name FROM POSITION(' ' IN u.name) + 1)), ''),
    u.email,
    -- Inactive users carried into people as soft-deleted, so the
    -- /api/people address book doesn't list disabled accounts.
    CASE WHEN u.is_active THEN NULL ELSE NOW() END,
    u.created_at,
    u.updated_at
  FROM users u
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. auth + auth_identities tables
-- ============================================================

CREATE TYPE auth_status AS ENUM ('invited', 'active', 'suspended');
CREATE TYPE auth_provider AS ENUM ('google', 'native');

CREATE TABLE auth (
    person_id UUID PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
    status auth_status NOT NULL DEFAULT 'active',
    -- app_role stays TEXT (not an enum) until the role surface settles.
    -- Today's values: 'admin', 'consultant', 'assistant'. Future invite
    -- flow adds 'family_member', possibly 'school_worker_user'.
    app_role TEXT NOT NULL DEFAULT 'consultant',
    -- Invite flow fields. NULL for accounts created via the legacy
    -- direct-OIDC path (today's consultants); populated when an
    -- operator invites a contact from the Contacts page.
    invited_at TIMESTAMPTZ,
    invited_by UUID REFERENCES people(id) ON DELETE SET NULL,
    invite_token TEXT,
    invite_expires_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_status_idx ON auth (status);

CREATE TABLE auth_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES auth(person_id) ON DELETE CASCADE,
    provider auth_provider NOT NULL,
    -- For OIDC providers this is the `sub` claim — for Google today
    -- we use the lowercase email since that's what the existing
    -- callback used as the lookup key. Native auth leaves it NULL.
    provider_subject TEXT,
    -- Bcrypt hash for native; NULL for OIDC. Populated only when
    -- provider='native'.
    password_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_subject)
);

CREATE INDEX auth_identities_person_idx ON auth_identities (person_id);

-- Triggers on auth (auth_identities is mostly insert/delete; skip
-- updated_at). audit_trigger covers both.
CREATE TRIGGER auth_set_updated_at BEFORE UPDATE ON auth
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER auth_audit AFTER INSERT OR UPDATE OR DELETE ON auth
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER auth_identities_audit
    AFTER INSERT OR UPDATE OR DELETE ON auth_identities
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ============================================================
-- 3. Backfill auth + auth_identities from users
-- ============================================================

INSERT INTO auth (person_id, status, app_role, last_login_at, created_at)
SELECT
    u.id,
    CASE WHEN u.is_active THEN 'active'::auth_status
                          ELSE 'suspended'::auth_status END,
    u.role,
    u.last_login_at,
    u.created_at
  FROM users u
ON CONFLICT (person_id) DO NOTHING;

-- Each existing user signed in via Google with their email as the
-- de-facto subject (callback uses email lookup). Capture that as
-- a 'google' identity so the new login flow finds them.
INSERT INTO auth_identities (person_id, provider, provider_subject, created_at)
SELECT u.id, 'google'::auth_provider, u.email::text, u.created_at
  FROM users u;

-- ============================================================
-- 3b. Update audit_trigger so tables keyed on person_id also get
--     a usable row_id in audit_log.
-- ============================================================
--
-- The baseline trigger pulled row_id via `(to_jsonb(NEW)->>'id')::UUID`,
-- which works for tables with an `id` PK but writes NULL on `auth`
-- (PK is `person_id`). The fallback covers that without breaking
-- the rest — the `id` lookup still wins when present.

CREATE OR REPLACE FUNCTION audit_trigger() RETURNS TRIGGER
SET search_path = public, pg_catalog
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
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. Repoint every user_id FK to people(id)
-- ============================================================
--
-- The legacy `users` table stays in place; routes that still read
-- it haven't been switched yet. Repointing FKs first is safe
-- because users.id == people.id for the migrated set.

ALTER TABLE engagements
    DROP CONSTRAINT engagements_lead_consultant_id_fkey;
ALTER TABLE engagements
    ADD CONSTRAINT engagements_lead_consultant_id_fkey
        FOREIGN KEY (lead_consultant_id) REFERENCES people(id) ON DELETE RESTRICT;

ALTER TABLE notes
    DROP CONSTRAINT notes_created_by_fkey;
ALTER TABLE notes
    ADD CONSTRAINT notes_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE followups
    DROP CONSTRAINT followups_assignee_id_fkey;
ALTER TABLE followups
    ADD CONSTRAINT followups_assignee_id_fkey
        FOREIGN KEY (assignee_id) REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE followups
    DROP CONSTRAINT followups_created_by_fkey;
ALTER TABLE followups
    ADD CONSTRAINT followups_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE school_visits
    DROP CONSTRAINT school_visits_created_by_fkey;
ALTER TABLE school_visits
    ADD CONSTRAINT school_visits_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE communications
    DROP CONSTRAINT communications_created_by_fkey;
ALTER TABLE communications
    ADD CONSTRAINT communications_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE invoices
    DROP CONSTRAINT invoices_created_by_fkey;
ALTER TABLE invoices
    ADD CONSTRAINT invoices_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE time_entries
    DROP CONSTRAINT time_entries_user_id_fkey;
ALTER TABLE time_entries
    ADD CONSTRAINT time_entries_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES people(id) ON DELETE RESTRICT;

ALTER TABLE expenses
    DROP CONSTRAINT expenses_user_id_fkey;
ALTER TABLE expenses
    ADD CONSTRAINT expenses_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE reports
    DROP CONSTRAINT reports_generated_by_fkey;
ALTER TABLE reports
    ADD CONSTRAINT reports_generated_by_fkey
        FOREIGN KEY (generated_by) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE documents
    DROP CONSTRAINT documents_uploaded_by_fkey;
ALTER TABLE documents
    ADD CONSTRAINT documents_uploaded_by_fkey
        FOREIGN KEY (uploaded_by) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE engagement_tasks
    DROP CONSTRAINT engagement_tasks_assignee_id_fkey;
ALTER TABLE engagement_tasks
    ADD CONSTRAINT engagement_tasks_assignee_id_fkey
        FOREIGN KEY (assignee_id) REFERENCES people(id) ON DELETE SET NULL;
ALTER TABLE engagement_tasks
    DROP CONSTRAINT engagement_tasks_created_by_fkey;
ALTER TABLE engagement_tasks
    ADD CONSTRAINT engagement_tasks_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE learning_profiles
    DROP CONSTRAINT learning_profiles_created_by_fkey;
ALTER TABLE learning_profiles
    ADD CONSTRAINT learning_profiles_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE agreements
    DROP CONSTRAINT agreements_created_by_fkey;
ALTER TABLE agreements
    ADD CONSTRAINT agreements_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE learning_supports
    DROP CONSTRAINT learning_supports_created_by_fkey;
ALTER TABLE learning_supports
    ADD CONSTRAINT learning_supports_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES people(id) ON DELETE SET NULL;
