-- Migration: Event reminders log
-- Date: 2026-05-07
-- Purpose:
--   Track when an owner manually triggers a WA reminder for an event from
--   /reminders page. We can't verify wa.me sends actually went through
--   (browser opens new tab to WhatsApp Web/Mobile), but logging the click
--   gives us:
--     - "Last reminded N hours ago" hint per event row
--     - Reminder count for {reminder_count} variable in templates
--     - Audit trail of who hit what when
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS event_reminders_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  recipient_label TEXT,
  sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_reminders_log_event
  ON event_reminders_log(event_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_reminders_log_template
  ON event_reminders_log(template_code);

COMMENT ON TABLE event_reminders_log IS
  'Manual WA reminder click log from /reminders page. Tracks intent to send, not delivery.';

-- RLS
ALTER TABLE event_reminders_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_reminders_log_read_owner" ON event_reminders_log;
CREATE POLICY "event_reminders_log_read_owner"
  ON event_reminders_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('super_admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "event_reminders_log_insert_owner" ON event_reminders_log;
CREATE POLICY "event_reminders_log_insert_owner"
  ON event_reminders_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('super_admin', 'owner')
    )
  );
