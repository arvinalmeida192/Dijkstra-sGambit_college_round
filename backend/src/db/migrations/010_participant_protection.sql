-- Phase: Participant Protection safeguards

DO $$ BEGIN
  ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'CANCELLED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'OVERDUE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Protection notification kinds (jobs use these deterministically)
DO $$ BEGIN
  ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'DEADLINE_PASSED_GRACE_ACTIVE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'GRACE_EXPIRING_WARNING';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'REVIEW_EXPIRING_WARNING';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'AUTO_APPROVED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Milestone protection defaults and escalation tracking
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_revisions INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS escalation_status TEXT NOT NULL DEFAULT 'NONE';

-- Reviews criteria checklist
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS unmet_criteria JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Extensions table
DO $$ BEGIN
  CREATE TYPE extension_status AS ENUM (
    'PROPOSED',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS milestone_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones (id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  new_due_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status extension_status NOT NULL DEFAULT 'PROPOSED',
  responded_by UUID REFERENCES users (id) ON DELETE RESTRICT,
  response_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT milestone_extensions_reason_nonempty CHECK (char_length(trim(reason)) >= 1)
);

CREATE INDEX IF NOT EXISTS milestone_extensions_milestone_id_idx ON milestone_extensions (milestone_id);
CREATE INDEX IF NOT EXISTS milestone_extensions_status_idx ON milestone_extensions (status);
