-- Phase 10: versioned agreements + acceptances

DO $$ BEGIN
  CREATE TYPE agreement_status AS ENUM (
    'PROPOSED',
    'ACTIVE',
    'SUPERSEDED',
    'WITHDRAWN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  terms JSONB NOT NULL,
  status agreement_status NOT NULL DEFAULT 'PROPOSED',
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  supersedes_id UUID REFERENCES agreements (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  CONSTRAINT agreements_version_positive CHECK (version >= 1),
  CONSTRAINT agreements_terms_object CHECK (jsonb_typeof(terms) = 'object'),
  CONSTRAINT agreements_project_version_unique UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS agreements_project_id_idx ON agreements (project_id);
CREATE INDEX IF NOT EXISTS agreements_status_idx ON agreements (status);

-- At most one active agreement per project.
CREATE UNIQUE INDEX IF NOT EXISTS agreements_one_active_per_project
  ON agreements (project_id)
  WHERE status = 'ACTIVE';

-- At most one open proposal per project.
CREATE UNIQUE INDEX IF NOT EXISTS agreements_one_proposed_per_project
  ON agreements (project_id)
  WHERE status = 'PROPOSED';

CREATE TABLE IF NOT EXISTS agreement_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES agreements (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Optional future wallet/signature reference. Null = application-level acceptance only.
  signature_ref TEXT,
  CONSTRAINT agreement_acceptances_unique UNIQUE (agreement_id, user_id)
);

CREATE INDEX IF NOT EXISTS agreement_acceptances_agreement_id_idx
  ON agreement_acceptances (agreement_id);
CREATE INDEX IF NOT EXISTS agreement_acceptances_user_id_idx
  ON agreement_acceptances (user_id);
