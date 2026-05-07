-- Migration: Event Drive folder integration
-- Date: 2026-05-07
-- Purpose:
--   Track auto-created Google Drive subfolder per event. Distinct from the
--   pre-existing design_drive_folder_url (which was a manual paste field
--   for design brief assets). drive_folder_id is the canonical Drive folder
--   ID used for API calls; drive_folder_url is the human-clickable link
--   stored alongside for convenience.
--
-- Idempotent: safe to re-run.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_folder_url TEXT,
  ADD COLUMN IF NOT EXISTS drive_folder_created_at TIMESTAMPTZ;

COMMENT ON COLUMN events.drive_folder_id IS
  'Google Drive folder ID auto-created by the app for this event. Source of truth; URL is derived.';
COMMENT ON COLUMN events.drive_folder_url IS
  'Cached https://drive.google.com/... URL for the auto-created folder.';
