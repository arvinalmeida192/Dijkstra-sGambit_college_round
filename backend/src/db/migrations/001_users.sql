-- Phase 07: users + auth foundation

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('CLIENT', 'FREELANCER', 'ARBITRATOR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  wallet_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_format CHECK (position('@' IN email) > 1),
  CONSTRAINT users_name_nonempty CHECK (char_length(trim(name)) >= 2)
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

-- Schema migrations ledger (used by migrate.js)
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
