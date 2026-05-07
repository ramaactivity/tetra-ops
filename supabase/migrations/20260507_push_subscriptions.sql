-- Migration: Web Push subscriptions
-- Date: 2026-05-07
-- Purpose:
--   Persist browser PushManager subscriptions per user so the server can
--   dispatch native OS notifications via Web Push (VAPID) when an anomaly
--   notification fires. Each user can have multiple subscriptions (one per
--   device/browser).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per (user, endpoint) — same browser shouldn't double-subscribe
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_subscriptions_user_endpoint
  ON push_subscriptions(user_id, endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active
  ON push_subscriptions(user_id) WHERE is_active = true;

COMMENT ON TABLE push_subscriptions IS
  'Browser PushManager subscriptions. Multiple per user (one per device/browser).';

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_self_read" ON push_subscriptions;
CREATE POLICY "push_subscriptions_self_read"
  ON push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subscriptions_self_write" ON push_subscriptions;
CREATE POLICY "push_subscriptions_self_write"
  ON push_subscriptions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
