-- Phase 21: Sandbox "Fund Project" Payment Flow (Razorpay Gateway + Milestone Funds)

DO $$ BEGIN
  CREATE TYPE project_funding_status AS ENUM (
    'PENDING',
    'PAID',
    'FAILED',
    'REFUNDED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE milestone_fund_status AS ENUM (
    'HELD',
    'RELEASED',
    'REFUNDED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'PROJECT_FUNDED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'MILESTONE_RELEASED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Project funding table
CREATE TABLE IF NOT EXISTS project_funding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL REFERENCES agreements (id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL, -- App cents (positive integer)
  currency TEXT NOT NULL DEFAULT 'INR',
  status project_funding_status NOT NULL DEFAULT 'PENDING',
  gateway_provider TEXT NOT NULL DEFAULT 'razorpay',
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  gateway_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT project_funding_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS project_funding_project_id_idx ON project_funding (project_id);
CREATE INDEX IF NOT EXISTS project_funding_agreement_id_idx ON project_funding (agreement_id);
CREATE INDEX IF NOT EXISTS project_funding_status_idx ON project_funding (status);
CREATE INDEX IF NOT EXISTS project_funding_order_id_idx ON project_funding (gateway_order_id);

-- At most one successful funding record per agreement version
CREATE UNIQUE INDEX IF NOT EXISTS project_funding_one_paid_per_agreement
  ON project_funding (agreement_id)
  WHERE status = 'PAID';

-- Milestone funds ledger
CREATE TABLE IF NOT EXISTS milestone_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES milestones (id) ON DELETE CASCADE,
  funding_id UUID NOT NULL REFERENCES project_funding (id) ON DELETE CASCADE,
  amount BIGINT NOT NULL, -- App cents (positive integer)
  status milestone_fund_status NOT NULL DEFAULT 'HELD',
  payout_reference TEXT,
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES users (id) ON DELETE SET NULL,
  release_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT milestone_funds_amount_positive CHECK (amount > 0),
  CONSTRAINT milestone_funds_milestone_unique UNIQUE (milestone_id)
);

CREATE INDEX IF NOT EXISTS milestone_funds_project_id_idx ON milestone_funds (project_id);
CREATE INDEX IF NOT EXISTS milestone_funds_funding_id_idx ON milestone_funds (funding_id);
CREATE INDEX IF NOT EXISTS milestone_funds_status_idx ON milestone_funds (status);

-- Gateway events for webhook idempotency
CREATE TABLE IF NOT EXISTS gateway_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'razorpay',
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gateway_events_provider_event_unique UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS gateway_events_event_id_idx ON gateway_events (event_id);

