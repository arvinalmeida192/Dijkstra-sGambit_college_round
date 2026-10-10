-- Phase 19: AI assessments (advisory) + deterministic deadline/inactivity notifications

DO $$ BEGIN
  CREATE TYPE ai_assessment_kind AS ENUM (
    'ACCEPTANCE_CRITERIA',
    'DISPUTE_EVIDENCE_SUMMARY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_assessment_status AS ENUM (
    'COMPLETED',
    'NEEDS_HUMAN_REVIEW',
    'MODEL_UNAVAILABLE',
    'INVALID_OUTPUT',
    'MODEL_DISAGREEMENT',
    'SKIPPED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE deliverable_type AS ENUM (
    'CODE',
    'TEXT',
    'VISUAL'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_kind AS ENUM (
    'DEADLINE_APPROACHING',
    'DEADLINE_PASSED',
    'INACTIVITY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ai_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind ai_assessment_kind NOT NULL,
  status ai_assessment_status NOT NULL,
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones (id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions (id) ON DELETE CASCADE,
  dispute_id UUID REFERENCES disputes (id) ON DELETE CASCADE,
  deliverable_type deliverable_type,
  provider TEXT NOT NULL DEFAULT 'ollama',
  model_primary TEXT,
  model_secondary TEXT,
  compare_mode BOOLEAN NOT NULL DEFAULT FALSE,
  -- Validated structured payload (criteria, evidence refs, outstanding, uncertainty, etc.)
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  advisory_notice TEXT NOT NULL DEFAULT
    'Advisory only. AI does not approve milestones, decide disputes, or authorize payments.',
  error_message TEXT,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_assessments_target CHECK (
    (kind = 'ACCEPTANCE_CRITERIA' AND submission_id IS NOT NULL AND milestone_id IS NOT NULL)
    OR (kind = 'DISPUTE_EVIDENCE_SUMMARY' AND dispute_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ai_assessments_project_id_idx ON ai_assessments (project_id);
CREATE INDEX IF NOT EXISTS ai_assessments_submission_id_idx ON ai_assessments (submission_id);
CREATE INDEX IF NOT EXISTS ai_assessments_dispute_id_idx ON ai_assessments (dispute_id);
CREATE INDEX IF NOT EXISTS ai_assessments_milestone_id_idx ON ai_assessments (milestone_id);
CREATE INDEX IF NOT EXISTS ai_assessments_created_at_idx ON ai_assessments (created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects (id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones (id) ON DELETE CASCADE,
  kind notification_kind NOT NULL,
  -- Deterministic idempotency key, e.g. deadline:passed:<milestoneId>:2026-10-10
  subject_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_title_nonempty CHECK (char_length(trim(title)) >= 1),
  CONSTRAINT notifications_subject_key_nonempty CHECK (char_length(trim(subject_key)) >= 1),
  CONSTRAINT notifications_user_kind_subject_unique UNIQUE (user_id, kind, subject_key)
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_project_id_idx ON notifications (project_id);

CREATE TABLE IF NOT EXISTS notification_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT notification_job_runs_name_nonempty CHECK (char_length(trim(job_name)) >= 1)
);

CREATE INDEX IF NOT EXISTS notification_job_runs_started_at_idx
  ON notification_job_runs (started_at DESC);
