-- Migration 013: Actionable freelancer work invitations & notifications

DO $$ BEGIN
  ALTER TYPE invitation_status ADD VALUE IF NOT EXISTS 'REJECTED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'PROJECT_INVITATION';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'INVITATION_ACCEPTED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'INVITATION_REJECTED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE project_invitations
  ADD COLUMN IF NOT EXISTS invited_user_id UUID REFERENCES users (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS project_invitations_invited_user_id_idx
  ON project_invitations (invited_user_id);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS invitation_id UUID REFERENCES project_invitations (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_invitation_id_idx
  ON notifications (invitation_id);

