-- Migration 012: Add processing fee and payout failure tracking to gateway funding
ALTER TABLE project_funding
  ADD COLUMN IF NOT EXISTS fee_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_payable BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_rate NUMERIC(6, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_status TEXT NOT NULL DEFAULT 'ESTIMATED';

-- Add FAILED status to milestone_fund_status enum if not present
DO $$ BEGIN
  ALTER TYPE milestone_fund_status ADD VALUE IF NOT EXISTS 'FAILED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE milestone_funds
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

