-- 20260618_simplify_event_lifecycle.sql
-- Simplify the event lifecycle to five statuses, driven automatically by the
-- event date + settlement:
--   upcoming · in_progress · awaiting_settlement · completed · cancelled
--
-- The deprecated draft / confirmed / archived values are folded into the new
-- model. The enum values themselves are intentionally LEFT in the event_status
-- type (Postgres can't easily drop enum values) but are no longer written by the
-- app — see src/lib/event-status.ts and the status-transition cron.
--
-- Mapping:
--   archived            → completed   (historical/legacy events, done; settlement N/A)
--   draft / confirmed   → date-driven (future→upcoming, today→in_progress, past→awaiting_settlement)
--
-- Live draft/confirmed events keep is_migrated_legacy=false, so the daily cron
-- continues to manage them afterwards. Legacy (archived) rows stay flagged
-- is_migrated_legacy=true and are excluded from the cron.

-- 1) Archived (legacy historical) events → completed.
UPDATE events
SET status = 'completed', updated_at = NOW()
WHERE status = 'archived';

-- 2) Live draft/confirmed events fold into the date-driven lifecycle.
UPDATE events
SET status = (CASE
  WHEN event_date > CURRENT_DATE THEN 'upcoming'
  WHEN event_date = CURRENT_DATE THEN 'in_progress'
  ELSE 'awaiting_settlement'
END)::event_status,
    updated_at = NOW()
WHERE status IN ('draft', 'confirmed');
