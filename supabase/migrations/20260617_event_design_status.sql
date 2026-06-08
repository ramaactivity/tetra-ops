-- 20260617_event_design_status.sql
-- Separate the DESIGN workflow from the EVENT lifecycle.
--
-- Before: events.status (enum) mixed design_brief/design_approved into the
-- lifecycle. Now design has its own column events.design_status
-- (belum | proses | approved), and event.status is pure lifecycle.
--
-- 1) add design_status, 2) backfill from existing design timestamps,
-- 3) move events parked at the deprecated design_* lifecycle statuses back to a
--    real lifecycle status (date-aware; the status-transition cron will refine).
-- The enum values design_brief/design_approved are intentionally left in the
-- event_status type (Postgres can't easily drop enum values) but are no longer
-- written by the app. design_brief_at / design_approved_at / design_drive_folder_url
-- are kept (timestamps + link remain useful).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS design_status TEXT NOT NULL DEFAULT 'belum'
  CHECK (design_status IN ('belum', 'proses', 'approved'));

-- Backfill design_status from existing design state.
UPDATE events SET design_status = CASE
  WHEN design_approved_at IS NOT NULL THEN 'approved'
  WHEN design_drive_folder_url IS NOT NULL OR design_brief_at IS NOT NULL THEN 'proses'
  ELSE 'belum'
END
WHERE id IS NOT NULL;

-- Move events off the deprecated design_* lifecycle statuses (date-aware).
UPDATE events SET status = (CASE
  WHEN event_date < CURRENT_DATE THEN 'in_progress'
  WHEN event_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'upcoming'
  ELSE 'confirmed'
END)::event_status
WHERE status IN ('design_brief', 'design_approved');

COMMENT ON COLUMN events.design_status IS
  'Design workflow status, separate from the event lifecycle: belum | proses | approved.';
