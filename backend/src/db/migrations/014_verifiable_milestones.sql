-- Migration 014: Verifiable Milestone Fulfilment and Smart-Contract-Enforced Release

-- 1. Preserve per-version milestone verification definitions on agreements
ALTER TABLE agreements
  ADD COLUMN IF NOT EXISTS milestone_terms JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Extend milestones with explicit verification criteria, frozen digest, and challenge window tracking
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS deliverable_description TEXT,
  ADD COLUMN IF NOT EXISTS verification_method TEXT NOT NULL DEFAULT 'HUMAN_REVIEWED'
    CHECK (verification_method IN ('AUTOMATED_CHECK', 'EVIDENCE_INTEGRITY_CHECK', 'HUMAN_REVIEWED')),
  ADD COLUMN IF NOT EXISTS verification_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS frozen_criteria_hash VARCHAR(66),
  ADD COLUMN IF NOT EXISTS frozen_agreement_version INT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN (
      'UNVERIFIED',
      'PENDING_VERIFICATION',
      'PASSED',
      'FAILED',
      'NEEDS_HUMAN_REVIEW',
      'CHALLENGE_WINDOW',
      'VERIFIED_ELIGIBLE'
    )),
  ADD COLUMN IF NOT EXISTS challenge_window_hours INT NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS challenge_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_escalation_days INT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS latest_verification_run_id UUID,
  ADD COLUMN IF NOT EXISTS latest_attestation_id UUID;

-- 3. Authorized verifier key registry (supports key rotation and revocation)
CREATE TABLE IF NOT EXISTS verifier_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_address VARCHAR(42) NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'Default Verifier',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- 4. Independent verification runs history (preserves all pass/fail/human-review runs and check breakdowns)
CREATE TABLE IF NOT EXISTS verification_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  agreement_id UUID REFERENCES agreements(id) ON DELETE SET NULL,
  agreement_version INT NOT NULL DEFAULT 1,
  verification_method TEXT NOT NULL
    CHECK (verification_method IN ('AUTOMATED_CHECK', 'EVIDENCE_INTEGRITY_CHECK', 'HUMAN_REVIEWED')),
  criteria_hash VARCHAR(66) NOT NULL,
  artifact_hash VARCHAR(66) NOT NULL,
  outcome TEXT NOT NULL
    CHECK (outcome IN ('PASSED', 'FAILED', 'NEEDS_HUMAN_REVIEW')),
  checks_executed JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL,
  error_details TEXT,
  executed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_runs_milestone ON verification_runs(milestone_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_runs_submission ON verification_runs(submission_id, created_at DESC);

-- 5. Signed EIP-712 verification attestations
CREATE TABLE IF NOT EXISTS verification_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_run_id UUID NOT NULL UNIQUE REFERENCES verification_runs(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  chain_id INT NOT NULL,
  escrow_address VARCHAR(42) NOT NULL,
  on_chain_agreement_id BIGINT NOT NULL DEFAULT 0,
  on_chain_milestone_id BIGINT NOT NULL DEFAULT 0,
  agreement_version INT NOT NULL,
  criteria_hash VARCHAR(66) NOT NULL,
  artifact_hash VARCHAR(66) NOT NULL,
  outcome SMALLINT NOT NULL CHECK (outcome IN (1, 2, 3)),
  nonce VARCHAR(66) NOT NULL UNIQUE,
  issued_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  verifier_address VARCHAR(42) NOT NULL,
  domain_separator VARCHAR(66) NOT NULL,
  struct_hash VARCHAR(66) NOT NULL,
  signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ISSUED'
    CHECK (status IN ('ISSUED', 'SUBMITTED_ON_CHAIN', 'RELEASED_ON_CHAIN', 'REVOKED', 'EXPIRED')),
  on_chain_tx_hash VARCHAR(66),
  release_tx_hash VARCHAR(66),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_attestations_milestone ON verification_attestations(milestone_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_attestations_submission ON verification_attestations(submission_id);

-- 6. Extend disputes with structured verification & criteria references and escalation deadlines
ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS disputed_criteria_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_run_id UUID REFERENCES verification_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
