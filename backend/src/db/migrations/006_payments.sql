-- Phase 17: payment tracking (blockchain-verified index — not source of truth for funds)

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'PENDING',
    'CONFIRMED',
    'RELEASED',
    'REFUNDED',
    'DISPUTED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES milestones (id) ON DELETE CASCADE,
  agreement_id UUID REFERENCES agreements (id) ON DELETE SET NULL,
  -- App display base units (cents). On-chain amount stored separately.
  amount BIGINT NOT NULL,
  amount_token_base TEXT,
  escrow_address TEXT NOT NULL,
  token_address TEXT,
  chain_id BIGINT NOT NULL,
  on_chain_agreement_id TEXT,
  on_chain_milestone_id TEXT,
  tx_hash TEXT,
  event_name TEXT,
  block_number BIGINT,
  status payment_status NOT NULL DEFAULT 'PENDING',
  failure_reason TEXT,
  reconciliation JSONB NOT NULL DEFAULT '{}'::jsonb,
  reported_by UUID REFERENCES users (id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT payments_escrow_nonempty CHECK (char_length(trim(escrow_address)) >= 1),
  CONSTRAINT payments_tx_hash_format CHECK (
    tx_hash IS NULL OR tx_hash ~ '^0x[a-fA-F0-9]{64}$'
  )
);

-- Idempotent sync: one payment row per transaction hash when present.
CREATE UNIQUE INDEX IF NOT EXISTS payments_tx_hash_unique
  ON payments (tx_hash)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_project_id_idx ON payments (project_id);
CREATE INDEX IF NOT EXISTS payments_milestone_id_idx ON payments (milestone_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE INDEX IF NOT EXISTS payments_chain_id_idx ON payments (chain_id);
