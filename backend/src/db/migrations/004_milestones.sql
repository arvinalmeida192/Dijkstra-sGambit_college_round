-- Phase 12: milestones + status enum

DO $$ BEGIN
  CREATE TYPE milestone_status AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'SUBMITTED',
    'IN_REVIEW',
    'REVISION_REQUESTED',
    'APPROVED',
    'DISPUTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  agreement_id UUID REFERENCES agreements (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  deliverables TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  -- Integer token base units / cents — never floats.
  amount BIGINT NOT NULL,
  due_date DATE,
  review_window_days INTEGER,
  status milestone_status NOT NULL DEFAULT 'PENDING',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status_note TEXT,
  submitted_at TIMESTAMPTZ,
  review_started_at TIMESTAMPTZ,
  review_due_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT milestones_title_nonempty CHECK (char_length(trim(title)) >= 2),
  CONSTRAINT milestones_deliverables_nonempty CHECK (char_length(trim(deliverables)) >= 1),
  CONSTRAINT milestones_criteria_nonempty CHECK (char_length(trim(acceptance_criteria)) >= 1),
  CONSTRAINT milestones_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT milestones_review_window_positive CHECK (
    review_window_days IS NULL OR review_window_days >= 1
  ),
  CONSTRAINT milestones_sort_order_nonnegative CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS milestones_project_id_idx ON milestones (project_id);
CREATE INDEX IF NOT EXISTS milestones_status_idx ON milestones (status);
CREATE INDEX IF NOT EXISTS milestones_due_date_idx ON milestones (due_date);
CREATE INDEX IF NOT EXISTS milestones_agreement_id_idx ON milestones (agreement_id);
