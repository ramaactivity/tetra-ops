-- Phase 6 (#5) — Opname cadence reminder rule: opname_overdue
-- =================================================================
-- A gentle nudge to run a physical stock-take when the last committed one is
-- stale (>30 days) or never happened. Stock accuracy is what the forecast and
-- HPP valuation stand on, so this keeps the whole chain trustworthy.
--
-- in-app only (send_push=false) and a single deduped reminder (stable entity_id
-- in checkOpnameOverdue) so it never nags. Enabled by default — low-noise.
-- Idempotent.

INSERT INTO notification_rules
  (code, name, description, category, severity, trigger_condition,
   recipient_roles, send_push, is_enabled)
VALUES
  ('opname_overdue',
   'Saatnya Stock Opname',
   'Remind owners to run a physical stock-take when the last committed one is >30 days old',
   'inventory',
   'info',
   '{"check": "opname_overdue", "days": 30}'::jsonb,
   ARRAY['super_admin', 'owner'],
   false,
   true)
ON CONFLICT (code) DO NOTHING;
