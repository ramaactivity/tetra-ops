-- Migration: bot_status.alert_notified_at — "bot down" alert dedup flag
-- Date: 2026-06-23
-- Purpose:
--   Feature 1 of WHATSAPP_BOT_ALERT_ANALITIK_HANDOVER. The dashboard pushes a
--   "bot WhatsApp mati" alert to owners when bot_status is unhealthy (heartbeat
--   `updated_at` stale > 5 min, or connection != 'open'). To push ONCE per
--   down-episode (not on every health check / every open dashboard tab), we
--   stamp this column when the alert fires and clear it when the bot recovers.
--
--   The atomic guard is: `UPDATE ... SET alert_notified_at = now()
--   WHERE id = 1 AND alert_notified_at IS NULL` — only the caller that flips it
--   from NULL sends the push, so concurrent dashboards/cron don't double-fire.
--
--   The bot (service_role) only writes connection/qr/updated_at/last_connected_at
--   on its own heartbeat, so this dashboard-owned column survives its writes.
--
-- Idempotent: safe to re-run.

alter table bot_status
  add column if not exists alert_notified_at timestamptz;
