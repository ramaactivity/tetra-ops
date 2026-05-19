-- 20260521_backfill_events_frame_size.sql
-- ============================================================================
-- Backfill events.frame_size dari packages.frame_size untuk events yang mismatch.
-- ============================================================================
--
-- Akar masalah:
--   Banyak events di production punya `frame_size = 'none'` walaupun package
--   yang dipilih jelas-jelas 2R atau 4R (mis. "2R Unlimited 3 Jam"). Akibatnya:
--     • rekap_field_mapping per-frame_size tidak match (rfm.frame_size != 'none')
--     • Default mapping rows (frame_size='') tidak punya item_id
--     • calculate_recap_hpp() return semua 0
--     • HPP di settlement selalu Rp 0 walaupun consumption tracked
--
-- Sample mismatch dari production (per 2026-05-19):
--   PRJ-20260509-41226 → ev=none, pkg=2R, package "2R Unlimited 3 Jam"
--   PRJ-20260417-00305 → ev=none, pkg=2R
--   8 dari 20 sample events (40%) mismatch.
--
-- Long-term fix: app code (src/app/(owner)/operations/new/page.tsx atau
-- bookings.ts) harus auto-set events.frame_size dari packages.frame_size saat
-- booking creation. Migration ini hanya backfill existing data.
--
-- Strategi: UPDATE events SET frame_size = pkg.frame_size WHERE mismatched.
-- Idempotent: re-run safe (matched events tidak terpengaruh, frame_size set
-- to same value).

-- Backfill events yang frame_size != package.frame_size dan package_id NOT NULL
UPDATE events ev
SET frame_size = pkg.frame_size,
    updated_at = NOW()
FROM packages pkg
WHERE ev.package_id = pkg.id
  AND ev.frame_size IS DISTINCT FROM pkg.frame_size
  AND pkg.frame_size IS NOT NULL
  AND pkg.frame_size != 'none';
-- Tidak override jika package.frame_size = 'none' atau NULL (preserve current state)

-- Skip event tanpa package (custom package) — frame_size manual-input
-- preserved as-is. User perlu set manual kalau perlu.

-- Verification query (run setelah apply):
-- SELECT
--   e.project_id, e.frame_size AS ev_frame, p.frame_size AS pkg_frame, p.name AS package
-- FROM events e
-- LEFT JOIN packages p ON p.id = e.package_id
-- WHERE e.deleted_at IS NULL
-- ORDER BY e.event_date DESC
-- LIMIT 20;
