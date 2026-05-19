-- 20260521_backfill_recap_frame_snapshot.sql
-- Backfill crew_rekap.frame_size_snapshot dari events.frame_size untuk row yang NULL.
-- Setelah migration ini, calculate_recap_hpp pakai snapshot (frozen) bukan
-- event.frame_size (live) — preserves historical accuracy kalau owner ubah event.
-- Idempotent (re-run safe; sudah-set rows tidak terimpacted).

UPDATE crew_rekap cr
SET frame_size_snapshot = e.frame_size,
    updated_at = NOW()
FROM events e
WHERE cr.event_id = e.id
  AND cr.frame_size_snapshot IS NULL;
