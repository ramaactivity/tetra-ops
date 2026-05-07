-- Migration: Crew invitations table + auto-promote flow
-- Date: 2026-05-07
-- Purpose:
--   users.id is FK to auth.users(id), so we can't pre-create users records
--   for crew that hasn't signed in yet. This table lets super_admin invite
--   crew by email with their tier already set; when that email signs in via
--   Google OAuth, the auth callback checks for a matching invitation and
--   auto-promotes them to role='crew' + correct tier (skipping the manual
--   pending_approval review step).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS crew_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  nickname TEXT,
  phone_wa TEXT,
  tier crew_tier NOT NULL,
  default_fee_override INTEGER,
  notes TEXT,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_crew_invitations_email
  ON crew_invitations(lower(email));
CREATE INDEX IF NOT EXISTS idx_crew_invitations_pending
  ON crew_invitations(accepted_at) WHERE accepted_at IS NULL;

COMMENT ON TABLE crew_invitations IS
  'Pre-registered crew waiting for first Google sign-in. Auth callback auto-promotes matching email to crew + tier.';

-- RLS
ALTER TABLE crew_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew_invitations_read_owner" ON crew_invitations;
CREATE POLICY "crew_invitations_read_owner"
  ON crew_invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('super_admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "crew_invitations_write_super_admin" ON crew_invitations;
CREATE POLICY "crew_invitations_write_super_admin"
  ON crew_invitations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  );
