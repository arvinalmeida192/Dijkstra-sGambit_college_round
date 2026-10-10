-- Phase 14: submissions, reviews, audit logs

DO $$ BEGIN
  CREATE TYPE review_decision AS ENUM (
    'START_REVIEW',
    'APPROVED',
    'REVISION_REQUESTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones (id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  agreement_id UUID REFERENCES agreements (id) ON DELETE SET NULL,
  submitted_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL,
  notes TEXT,
  external_url TEXT,
  -- Opaque private storage key (never a public URL). Null for link-only submissions.
  file_ref TEXT,
  original_filename TEXT,
  content_type TEXT,
  byte_size BIGINT,
  -- SHA-256 of uploaded file bytes only. Never trust client-provided hashes.
  sha256_hash TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submissions_revision_positive CHECK (revision >= 1),
  CONSTRAINT submissions_milestone_revision_unique UNIQUE (milestone_id, revision),
  CONSTRAINT submissions_has_payload CHECK (
    (file_ref IS NOT NULL AND sha256_hash IS NOT NULL)
    OR (external_url IS NOT NULL AND char_length(trim(external_url)) >= 1)
    OR (notes IS NOT NULL AND char_length(trim(notes)) >= 1)
  ),
  CONSTRAINT submissions_sha256_format CHECK (
    sha256_hash IS NULL OR sha256_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT submissions_byte_size_nonnegative CHECK (
    byte_size IS NULL OR byte_size >= 0
  )
);

CREATE INDEX IF NOT EXISTS submissions_milestone_id_idx ON submissions (milestone_id);
CREATE INDEX IF NOT EXISTS submissions_project_id_idx ON submissions (project_id);
CREATE INDEX IF NOT EXISTS submissions_submitted_by_idx ON submissions (submitted_by);
CREATE INDEX IF NOT EXISTS submissions_sha256_hash_idx ON submissions (sha256_hash);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES milestones (id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  decision review_decision NOT NULL,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reviews_revision_feedback CHECK (
    decision <> 'REVISION_REQUESTED'
    OR (feedback IS NOT NULL AND char_length(trim(feedback)) >= 1)
  )
);

CREATE INDEX IF NOT EXISTS reviews_submission_id_idx ON reviews (submission_id);
CREATE INDEX IF NOT EXISTS reviews_milestone_id_idx ON reviews (milestone_id);
CREATE INDEX IF NOT EXISTS reviews_reviewer_id_idx ON reviews (reviewer_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  milestone_id UUID REFERENCES milestones (id) ON DELETE SET NULL,
  submission_id UUID REFERENCES submissions (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_logs_action_nonempty CHECK (char_length(trim(action)) >= 1)
);

CREATE INDEX IF NOT EXISTS audit_logs_project_id_idx ON audit_logs (project_id);
CREATE INDEX IF NOT EXISTS audit_logs_milestone_id_idx ON audit_logs (milestone_id);
CREATE INDEX IF NOT EXISTS audit_logs_submission_id_idx ON audit_logs (submission_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);
