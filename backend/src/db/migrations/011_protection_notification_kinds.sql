-- Protection notification kinds used by deterministic escalation jobs.
-- Safe to re-run / duplicate with 010 for environments that already applied 010.

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
