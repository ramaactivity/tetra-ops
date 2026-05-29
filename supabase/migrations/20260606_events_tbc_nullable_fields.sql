-- 20260606_events_tbc_nullable_fields.sql
-- ============================================================================
-- TBC ("To Be Confirmed" / "Menyusul") — allow events.start_time, setup_time,
-- end_time, dan frame_size jadi NULLABLE.
--
-- Rationale:
--   Klien sering kasih booking sebelum pasti soal jam acara / ukuran cetakan.
--   Owner butuh bisa input event sekarang dengan field tersebut TBC, lalu
--   update saat info pasti tersedia. Crew juga harus lihat status TBC di
--   schedule supaya tau info pending.
--
--   Backdrop sudah nullable (backdrop_id UUID). Ikut pola yang sama:
--   NULL = menyusul, value = sudah pasti.
--
-- Impact:
--   - Kode existing (UI form + crew view + rekap) harus handle NULL gracefully
--   - Migration ini ADDITIVE & backward-compatible — semua existing data tidak
--     berubah (mereka semua punya value valid)
--   - DEFAULT tidak di-set: explicit insert tanpa value akan jadi NULL
-- ============================================================================

ALTER TABLE events ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE events ALTER COLUMN setup_time DROP NOT NULL;
ALTER TABLE events ALTER COLUMN end_time DROP NOT NULL;
ALTER TABLE events ALTER COLUMN frame_size DROP NOT NULL;
