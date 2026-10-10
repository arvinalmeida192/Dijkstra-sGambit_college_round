-- Phase 08: projects + invitations

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  client_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  freelancer_id UUID REFERENCES users (id) ON DELETE RESTRICT,
  external_url TEXT,
  status project_status NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT projects_title_nonempty CHECK (char_length(trim(title)) >= 2),
  CONSTRAINT projects_external_url_http CHECK (
    external_url IS NULL
    OR external_url ~* '^https?://'
  ),
  CONSTRAINT projects_distinct_participants CHECK (
    freelancer_id IS NULL OR freelancer_id <> client_id
  )
);

CREATE INDEX IF NOT EXISTS projects_client_id_idx ON projects (client_id);
CREATE INDEX IF NOT EXISTS projects_freelancer_id_idx ON projects (freelancer_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);

CREATE TABLE IF NOT EXISTS project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  invited_email TEXT,
  invited_role user_role NOT NULL DEFAULT 'FREELANCER',
  status invitation_status NOT NULL DEFAULT 'PENDING',
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  accepted_by UUID REFERENCES users (id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_invitations_token_unique UNIQUE (token),
  CONSTRAINT project_invitations_role_freelancer CHECK (invited_role = 'FREELANCER'),
  CONSTRAINT project_invitations_email_format CHECK (
    invited_email IS NULL OR position('@' IN invited_email) > 1
  )
);

CREATE INDEX IF NOT EXISTS project_invitations_project_id_idx
  ON project_invitations (project_id);
CREATE INDEX IF NOT EXISTS project_invitations_status_idx
  ON project_invitations (status);

-- At most one pending invitation per project (MVP: single counterparty seat).
CREATE UNIQUE INDEX IF NOT EXISTS project_invitations_one_pending_per_project
  ON project_invitations (project_id)
  WHERE status = 'PENDING';
