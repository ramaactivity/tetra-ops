-- 20260618_backfill_rekap_submitted_status.sql
--
-- Data cleanup: 5 rekaps submitted before the app started writing status fixes
-- (commit 9a1956e, 2026-06-15) are stuck at the column default status='draft'
-- even though they are real crew submissions (submitted_by set, not yet
-- reviewed). The earlier 20260520 backfill ran before these rows existed.
--
-- The owner approval path and the "Perlu submit rekap" list both key off
-- is_approved/locked (not status), so this is integrity/reporting hygiene, not a
-- functional blocker. Bring the state machine in sync with reality. Idempotent.

UPDATE crew_rekap
SET status = 'submitted'
WHERE status = 'draft'
  AND submitted_by IS NOT NULL
  AND is_approved IS NULL
  AND COALESCE(locked, false) = false;
