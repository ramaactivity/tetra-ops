-- Migration: RLS policies for contacts table
-- Date: 2026-05-07
-- Purpose:
--   The original contacts table migration enabled the table but didn't add
--   row-level security policies. Supabase rejects all writes by default in
--   that state ("new row violates row-level security policy").
--
--   Pattern matches backdrops/event_types policies from earlier migration:
--     - SELECT: any authenticated user (so crew can see PIC info on event detail)
--     - INSERT / UPDATE / DELETE: super_admin or owner only
--
-- Idempotent: safe to re-run.

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_read_authn" ON contacts;
CREATE POLICY "contacts_read_authn"
  ON contacts
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "contacts_write_owner" ON contacts;
CREATE POLICY "contacts_write_owner"
  ON contacts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('super_admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('super_admin', 'owner')
    )
  );
