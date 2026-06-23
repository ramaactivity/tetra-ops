-- Phase 4 — Proactive forecast alert rule: stock_forecast_low
-- =================================================================
-- Seeds the notification_rules row the anomaly scanner dispatches on. The check
-- function (checkForecastShortfall in src/lib/actions/anomaly-scanner.ts) reuses
-- computeForecast() and emits one notification per item projected to run short
-- across upcoming events.
--
-- Shipped is_enabled=false: enable only after a manual dry-run (runAnomalyScanner)
-- confirms the matches look right, to avoid spamming owners on first deploy.
-- Idempotent: ON CONFLICT (code) keeps an existing row's enabled state.

INSERT INTO notification_rules
  (code, name, description, category, severity, trigger_condition,
   recipient_roles, send_push, is_enabled)
VALUES
  ('stock_forecast_low',
   'Stok kurang untuk event mendatang',
   'Warn when projected demand across upcoming events exceeds on-hand stock',
   'inventory',
   'warning',
   '{"check": "forecast_shortfall"}'::jsonb,
   ARRAY['super_admin', 'owner'],
   true,
   false)
ON CONFLICT (code) DO NOTHING;
