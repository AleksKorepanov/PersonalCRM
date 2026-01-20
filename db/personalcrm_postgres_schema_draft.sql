-- PersonalCRM (cloud) - PostgreSQL schema draft
-- ------------------------------------------------------------
-- Goals:
-- 1) Workspace-scoped multi-tenant data model.
-- 2) Assistant access with server-side redaction (privacy labels).
-- 3) Fast search/filtering (GIN/BTREE) and interaction timelines.
-- 4) Auditable changes (audit_log).
--
-- Conventions:
-- - UUID PKs (gen_random_uuid()).
-- - timestamptz for event times.
-- - Soft delete via deleted_at (NULL = active).
-- - JSONB for variable attributes (phones/emails/messengers/context).
--
-- IMPORTANT:
-- This is a DRAFT intended for iteration. RLS policies assume the app sets:
--   SET app.user_id = '<uuid>';
--   SET app.workspace_id = '<uuid>';
-- And uses SECURITY DEFINER functions below.

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;        -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS btree_gin;     -- optional, composite gin support
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- optional, fast ILIKE / similarity

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM ('owner', 'assistant', 'collaborator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE record_visibility AS ENUM ('private', 'shared', 'limited');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tie_strength AS ENUM ('close', 'medium', 'weak');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE interaction_type AS ENUM ('meeting', 'call', 'message', 'email', 'event', 'intro', 'help_given', 'help_received', 'note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE introduction_status AS ENUM ('requested', 'approved_a', 'approved_b', 'sent', 'met', 'closed_success', 'closed_no_fit', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_status AS ENUM ('open', 'done', 'cancelled', 'snoozed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_type AS ENUM ('touchpoint', 'birthday', 'anniversary', 'followup', 'project', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('idea', 'active', 'paused', 'done', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_entity_type AS ENUM ('contact', 'organization', 'interaction', 'introduction', 'reminder', 'project', 'strategy', 'wheel_segment', 'rbac', 'auth');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- Helper functions for RLS (app must set GUCs)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app_current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.workspace_id', true), '')::uuid;
$$;

-- Is current user an active member of the workspace?
CREATE OR REPLACE FUNCTION app_is_workspace_member(wid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_memberships m
    WHERE m.workspace_id = wid
      AND m.user_id = app_current_user_id()
      AND m.is_active = true
      AND m.deleted_at IS NULL
  );
$$;

-- Does current membership have owner role?
CREATE OR REPLACE FUNCTION app_is_owner(wid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_memberships m
    WHERE m.workspace_id = wid
      AND m.user_id = app_current_user_id()
      AND m.is_active = true
      AND m.role = 'owner'
      AND m.deleted_at IS NULL
  );
$$;

-- ------------------------------------------------------------
-- Core tenancy: workspaces, users, memberships
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  display_name  text,
  avatar_url    text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_user_id);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          membership_role NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  invited_by    uuid REFERENCES users(id),
  invited_at    timestamptz,
  accepted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON workspace_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON workspace_memberships(workspace_id, role);

-- ------------------------------------------------------------
-- RBAC (optional above/beyond membership_role)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  key           text PRIMARY KEY,
  description   text
);

-- Some suggested permissions (seed examples)
INSERT INTO permissions(key, description) VALUES
  ('contacts.read', 'Read contacts (redacted by visibility)'),
  ('contacts.read_private', 'Read private fields/records'),
  ('contacts.write', 'Create/update contacts'),
  ('interactions.read', 'Read interactions'),
  ('interactions.write', 'Create/update interactions'),
  ('introductions.manage', 'Create/manage introductions'),
  ('reminders.manage', 'Create/manage reminders'),
  ('projects.manage', 'Create/manage projects'),
  ('strategy.manage', 'Update strategy and wheel'),
  ('rbac.manage', 'Manage roles and permissions'),
  ('audit.read', 'Read audit log')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS workspace_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS workspace_role_permissions (
  role_id        uuid NOT NULL REFERENCES workspace_roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions(key) ON DELETE RESTRICT,
  PRIMARY KEY (role_id, permission_key)
);

-- Assign zero or more roles to a member (in addition to membership_role)
CREATE TABLE IF NOT EXISTS membership_roles (
  workspace_id   uuid NOT NULL,
  user_id        uuid NOT NULL,
  role_id        uuid NOT NULL REFERENCES workspace_roles(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, role_id),
  FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_memberships(workspace_id, user_id) ON DELETE CASCADE
);

-- Helper: permission check (simple)
CREATE OR REPLACE FUNCTION app_has_permission(wid uuid, perm text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    app_is_owner(wid)
    OR EXISTS (
      SELECT 1
      FROM membership_roles mr
      JOIN workspace_role_permissions rp ON rp.role_id = mr.role_id
      WHERE mr.workspace_id = wid
        AND mr.user_id = app_current_user_id()
        AND rp.permission_key = perm
    );
$$;

-- ------------------------------------------------------------
-- Organizations
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  website       text,
  industry      text,
  city          text,
  notes_shared  text,
  notes_private text,
  created_by    uuid REFERENCES users(id),
  updated_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_orgs_ws_name ON organizations(workspace_id, name);

-- ------------------------------------------------------------
-- Contacts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Identity
  first_name             text,
  last_name              text,
  middle_name            text,
  display_name           text GENERATED ALWAYS AS (
    trim(both ' ' from coalesce(last_name,'') || ' ' || coalesce(first_name,'') || ' ' || coalesce(middle_name,''))
  ) STORED,
  photo_url              text,

  -- Comms
  emails                 jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{"email": "x@y", "label": "work"}]
  phones                 jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{"phone": "+66...", "label": "mobile"}]
  messengers             jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{"type": "telegram", "handle": "@..."}]

  -- Profile
  city                   text,
  timezone               text,
  birthday               date,
  organization_id        uuid REFERENCES organizations(id),
  job_title              text,
  industries             text[] NOT NULL DEFAULT ARRAY[]::text[],
  competencies           text[] NOT NULL DEFAULT ARRAY[]::text[],

  -- Relationship / social capital
  cluster                text,                   -- e.g., mentor/partner/investor/expert/friend
  visibility             record_visibility NOT NULL DEFAULT 'shared',
  tie_strength           tie_strength NOT NULL DEFAULT 'weak',
  trust_score            smallint,               -- 1..10 (may be private)
  emotional_balance      numeric(10,2),          -- +/- balance score
  willingness_to_help    smallint,               -- 1..10

  -- Context
  met_at                 date,
  met_where              text,
  met_via                text,
  context                jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Notes: split shared/private for assistant redaction
  notes_shared           text,
  notes_private          text,

  -- Touch cadence
  last_interaction_at    timestamptz,
  next_touch_at          timestamptz,

  -- Bookkeeping
  created_by             uuid REFERENCES users(id),
  updated_by             uuid REFERENCES users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz,

  -- Full-text search
  search_tsv             tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(display_name,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(job_title,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(met_where,'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(notes_shared,'')), 'D')
  ) STORED
);

-- Common filters
CREATE INDEX IF NOT EXISTS idx_contacts_ws_updated ON contacts(workspace_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_ws_visibility ON contacts(workspace_id, visibility) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_ws_tie ON contacts(workspace_id, tie_strength) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_ws_next_touch ON contacts(workspace_id, next_touch_at) WHERE deleted_at IS NULL;

-- Search
CREATE INDEX IF NOT EXISTS idx_contacts_search_tsv ON contacts USING GIN (search_tsv) WHERE deleted_at IS NULL;
-- Optional fuzzy search (ILIKE) on display_name
CREATE INDEX IF NOT EXISTS idx_contacts_display_trgm ON contacts USING GIN (display_name gin_trgm_ops) WHERE deleted_at IS NULL;

-- Tags (normalized)
CREATE TABLE IF NOT EXISTS tags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  color         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id        uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag_id);

-- ------------------------------------------------------------
-- Interactions (timeline)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id        uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type              interaction_type NOT NULL,
  channel           text,                  -- e.g., zoom, phone, telegram, email
  occurred_at       timestamptz NOT NULL,
  summary           text,
  outcome           text,

  -- Next action
  next_action       text,
  next_action_at    timestamptz,

  -- Privacy
  visibility        record_visibility NOT NULL DEFAULT 'shared',

  -- Metadata
  created_by        uuid REFERENCES users(id),
  updated_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,

  search_tsv        tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(summary,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(outcome,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(next_action,'')), 'C')
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_interactions_ws_contact_time
  ON interactions(workspace_id, contact_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_ws_time
  ON interactions(workspace_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_ws_next_action
  ON interactions(workspace_id, next_action_at)
  WHERE deleted_at IS NULL AND next_action_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_search_tsv
  ON interactions USING GIN (search_tsv)
  WHERE deleted_at IS NULL;

-- Denormalized touch update trigger (contacts.last_interaction_at)
CREATE OR REPLACE FUNCTION trg_contacts_touch_from_interaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE contacts
      SET last_interaction_at = GREATEST(coalesce(last_interaction_at, 'epoch'::timestamptz), NEW.occurred_at),
          updated_at = now(),
          updated_by = NEW.created_by
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interactions_after_insert_touch ON interactions;
CREATE TRIGGER interactions_after_insert_touch
AFTER INSERT ON interactions
FOR EACH ROW
EXECUTE FUNCTION trg_contacts_touch_from_interaction();

-- ------------------------------------------------------------
-- Introductions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS introductions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  requester_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  introducer_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  target_contact_id    uuid REFERENCES contacts(id) ON DELETE SET NULL,

  request_text         text,
  benefit_a            text,
  benefit_b            text,

  consent_a            boolean NOT NULL DEFAULT false,
  consent_b            boolean NOT NULL DEFAULT false,

  status               introduction_status NOT NULL DEFAULT 'requested',
  sent_at              timestamptz,
  met_at               timestamptz,
  outcome              text,

  visibility           record_visibility NOT NULL DEFAULT 'shared',

  created_by           uuid REFERENCES users(id),
  updated_by           uuid REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_intros_ws_status ON introductions(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_intros_ws_created ON introductions(workspace_id, created_at DESC) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Reminders
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id      uuid REFERENCES contacts(id) ON DELETE CASCADE,
  project_id      uuid,
  type            reminder_type NOT NULL,
  status          reminder_status NOT NULL DEFAULT 'open',
  title           text,
  note            text,
  due_at          timestamptz NOT NULL,
  snoozed_until   timestamptz,
  assigned_to     uuid REFERENCES users(id),
  visibility      record_visibility NOT NULL DEFAULT 'shared',
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES users(id),
  updated_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_reminders_ws_due ON reminders(workspace_id, due_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_ws_status ON reminders(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_ws_assignee ON reminders(workspace_id, assigned_to) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Strategy (single row per workspace)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS strategy (
  workspace_id     uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  vision           text,
  long_term_goal   text,
  goals            jsonb NOT NULL DEFAULT '[]'::jsonb,
  swot             jsonb NOT NULL DEFAULT '{}'::jsonb,
  roadmap          jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by       uuid REFERENCES users(id),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Wheel segments (9 sectors)
CREATE TABLE IF NOT EXISTS wheel_segments (
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  segment_key      text NOT NULL,               -- e.g., 'mentors', 'partners', ...
  current_score    smallint,
  target_score     smallint,
  notes            text,
  updated_by       uuid REFERENCES users(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, segment_key)
);

-- ------------------------------------------------------------
-- Projects
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  status          project_status NOT NULL DEFAULT 'idea',
  visibility      record_visibility NOT NULL DEFAULT 'shared',
  start_date      date,
  end_date        date,
  created_by      uuid REFERENCES users(id),
  updated_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  search_tsv      tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description,'')), 'B')
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_projects_ws_status ON projects(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_ws_updated ON projects(workspace_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_search_tsv ON projects USING GIN (search_tsv) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS project_participants (
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role            text,
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_project_participants_contact ON project_participants(contact_id);

-- ------------------------------------------------------------
-- Attachments (files/links)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_type     text NOT NULL,     -- 'contact'|'interaction'|'project'|...
  object_id       uuid NOT NULL,
  file_url        text NOT NULL,
  file_name       text,
  mime_type       text,
  size_bytes      bigint,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_object ON attachments(workspace_id, object_type, object_id);

-- ------------------------------------------------------------
-- Audit log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id   uuid REFERENCES users(id),
  action_key      text NOT NULL, -- e.g., 'contact.create', 'contact.update'
  entity_type     audit_entity_type NOT NULL,
  entity_id       uuid,
  before          jsonb,
  after           jsonb,
  ip              inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_ws_time ON audit_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_ws_actor ON audit_log(workspace_id, actor_user_id, created_at DESC);

-- ------------------------------------------------------------
-- Row Level Security (RLS)
-- ------------------------------------------------------------
-- NOTE: RLS is optional; many teams enforce auth in service layer.
-- If you enable it, ensure your migrations run with a role that can bypass RLS.

-- Contacts RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_select ON contacts;
CREATE POLICY contacts_select ON contacts
FOR SELECT
USING (
  contacts.workspace_id = app_current_workspace_id()
  AND app_is_workspace_member(contacts.workspace_id)
  AND (
    app_is_owner(contacts.workspace_id)
    OR app_has_permission(contacts.workspace_id, 'contacts.read_private')
    OR contacts.visibility IN ('shared','limited')
  )
);

DROP POLICY IF EXISTS contacts_write ON contacts;
CREATE POLICY contacts_write ON contacts
FOR INSERT, UPDATE, DELETE
USING (
  contacts.workspace_id = app_current_workspace_id()
  AND app_is_workspace_member(contacts.workspace_id)
  AND (app_is_owner(contacts.workspace_id) OR app_has_permission(contacts.workspace_id, 'contacts.write'))
)
WITH CHECK (
  contacts.workspace_id = app_current_workspace_id()
);

-- Interactions RLS
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interactions_select ON interactions;
CREATE POLICY interactions_select ON interactions
FOR SELECT
USING (
  interactions.workspace_id = app_current_workspace_id()
  AND app_is_workspace_member(interactions.workspace_id)
  AND (
    app_is_owner(interactions.workspace_id)
    OR app_has_permission(interactions.workspace_id, 'interactions.read')
    OR interactions.visibility IN ('shared','limited')
  )
);

DROP POLICY IF EXISTS interactions_write ON interactions;
CREATE POLICY interactions_write ON interactions
FOR INSERT, UPDATE, DELETE
USING (
  interactions.workspace_id = app_current_workspace_id()
  AND app_is_workspace_member(interactions.workspace_id)
  AND (app_is_owner(interactions.workspace_id) OR app_has_permission(interactions.workspace_id, 'interactions.write'))
)
WITH CHECK (
  interactions.workspace_id = app_current_workspace_id()
);

-- Similar RLS can be added for introductions/reminders/projects/audit_log as needed.

COMMIT;
