-- Dispute resolution and work resumption (mutual agreement + arbitrator outcome)

DO $$ BEGIN
  ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'CANCELLED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dispute_resolution_outcome AS ENUM (
    'RESUME_EXISTING',
    'RESUME_WITH_CHANGES',
    'TERMINATE_WORK'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dispute_resolution_type AS ENUM (
    'MUTUAL_AGREEMENT',
    'ARBITRATOR_DECISION'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS resolution_type dispute_resolution_type,
  ADD COLUMN IF NOT EXISTS resolution_outcome dispute_resolution_outcome,
  ADD COLUMN IF NOT EXISTS resolution_summary TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_proposal JSONB;

ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_decision_consistency;

ALTER TABLE disputes ADD CONSTRAINT disputes_decision_consistency CHECK (
  (status <> 'RESOLVED' AND decision IS NULL AND decided_at IS NULL AND resolution_outcome IS NULL AND resolved_at IS NULL)
  OR (
    status = 'RESOLVED' AND (
      (
        decision IS NOT NULL
        AND decided_at IS NOT NULL
        AND arbitrator_id IS NOT NULL
        AND decision_rationale IS NOT NULL
        AND char_length(trim(decision_rationale)) >= 1
      )
      OR (
        resolution_outcome IS NOT NULL
        AND resolved_at IS NOT NULL
        AND resolution_summary IS NOT NULL
        AND char_length(trim(resolution_summary)) >= 1
        AND resolved_by IS NOT NULL
        AND resolution_type IS NOT NULL
      )
    )
  )
);

CREATE INDEX IF NOT EXISTS disputes_resolved_by_idx ON disputes (resolved_by);
CREATE INDEX IF NOT EXISTS disputes_resolution_outcome_idx ON disputes (resolution_outcome);
