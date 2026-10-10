-- Migration 010: Add description column to milestones
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS description TEXT;

