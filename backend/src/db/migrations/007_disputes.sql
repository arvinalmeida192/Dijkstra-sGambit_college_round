-- Phase 18: disputes + private evidence

DO $$ BEGIN
  CREATE TYPE dispute_status AS ENUM (
    'OPEN',
    'UNDER_REVIEW',
    'RESOLVED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dispute_decision AS ENUM (
    'RELEASE_TO_FREELANCER',
    'REFUND_TO_CLIENT',
    'SPLIT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES milestones (id) ON DELETE CASCADE,
  opened_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  claim_summary TEXT,
  status dispute_status NOT NULL DEFAULT 'OPEN',
  arbitrator_id UUID REFERENCES users (id) ON DELETE SET NULL,
  decision dispute_decision,
  decision_rationale TEXT,
  split_release_to_freelancer BIGINT,
  decided_at TIMESTAMPTZ,
  -- Optional link to a reported on-chain DisputeOpened / DisputeResolved payment row
  open_payment_id UUID REFERENCES payments (id) ON DELETE SET NULL,
  resolve_payment_id UUID REFERENCES payments (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT disputes_reason_nonempty CHECK (char_length(trim(reason)) >= 3),
  CONSTRAINT disputes_decision_consistency CHECK (
    (status <> 'RESOLVED' AND decision IS NULL AND decided_at IS NULL)
    OR (
      status = 'RESOLVED'
      AND decision IS NOT NULL
      AND decided_at IS NOT NULL
      AND arbitrator_id IS NOT NULL
      AND decision_rationale IS NOT NULL
      AND char_length(trim(decision_rationale)) >= 1
    )
  ),
  CONSTRAINT disputes_split_amount CHECK (
    decision IS DISTINCT FROM 'SPLIT'
    OR (split_release_to_freelancer IS NOT NULL AND split_release_to_freelancer >= 0)
  )
);

-- At most one non-resolved dispute per milestone.
CREATE UNIQUE INDEX IF NOT EXISTS disputes_one_open_per_milestone
  ON disputes (milestone_id)
  WHERE status IN ('OPEN', 'UNDER_REVIEW');

CREATE INDEX IF NOT EXISTS disputes_project_id_idx ON disputes (project_id);
CREATE INDEX IF NOT EXISTS disputes_milestone_id_idx ON disputes (milestone_id);
CREATE INDEX IF NOT EXISTS disputes_status_idx ON disputes (status);
CREATE INDEX IF NOT EXISTS disputes_arbitrator_id_idx ON disputes (arbitrator_id);

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes (id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  notes TEXT,
  external_url TEXT,
  -- Opaque private storage key — never a public URL.
  file_ref TEXT,
  original_filename TEXT,
  content_type TEXT,
  byte_size BIGINT,
  sha256_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dispute_evidence_has_payload CHECK (
    (file_ref IS NOT NULL AND sha256_hash IS NOT NULL)
    OR (external_url IS NOT NULL AND char_length(trim(external_url)) >= 1)
    OR (notes IS NOT NULL AND char_length(trim(notes)) >= 1)
  ),
  CONSTRAINT dispute_evidence_sha256_format CHECK (
    sha256_hash IS NULL OR sha256_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT dispute_evidence_byte_size_nonnegative CHECK (
    byte_size IS NULL OR byte_size >= 0
  )
);

CREATE INDEX IF NOT EXISTS dispute_evidence_dispute_id_idx
  ON dispute_evidence (dispute_id);
CREATE INDEX IF NOT EXISTS dispute_evidence_uploaded_by_idx
  ON dispute_evidence (uploaded_by);
