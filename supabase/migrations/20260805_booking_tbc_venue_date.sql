-- 20260805_booking_tbc_venue_date.sql
-- ============================================================================
-- "Menyusul / TBC" untuk Lokasi & Tanggal event.
-- ============================================================================
--
-- Konteks: klien sering mau booking dulu sebelum datanya lengkap — belum tahu
-- venue, belum ada PIC lapangan, tanggal masih perkiraan. Sebelum ini form
-- memaksa venue_name terisi, jadi owner mengarang ("TBA", "-", "belum tau")
-- dan data karangan itu ikut ke surat jalan, PDF, dan pesan WA ke crew.
--
-- Dua perlakuan BERBEDA, sengaja:
--
-- 1. venue_name → DROP NOT NULL. Mengikuti konvensi yang sudah dipakai
--    20260606_events_tbc_nullable_fields.sql: NULL = menyusul, ada isi = pasti.
--    Aman karena venue cuma dibaca untuk ditampilkan, bukan untuk menghitung.
--
-- 2. event_date TIDAK dibuat nullable. Kolom itu kunci partisi seluruh
--    aplikasi: cron transisi status, endpoint availability (dipakai bot WA),
--    guard bentrok crew, freeze cutoff keuangan, dan semua KPI memfilter
--    dengan =/</>/BETWEEN pada event_date. NULL tidak pernah cocok dengan
--    operator itu, jadi event-nya akan hilang diam-diam TANPA error: slot
--    dianggap kosong, event tak pernah berpindah status, tak pernah dibekukan
--    cutoff. Alih-alih itu, owner tetap mengisi tanggal PERKIRAAN dan
--    menandainya lewat flag di bawah — mesin tetap jalan benar, manusia tahu
--    angkanya belum pasti.
--
-- Idempotent.

ALTER TABLE events ALTER COLUMN venue_name DROP NOT NULL;

COMMENT ON COLUMN events.venue_name IS
  'NULL = lokasi menyusul (TBC). Konvensi sama dengan start_time/frame_size.';

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_date_is_estimate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN events.event_date_is_estimate IS
  'true = event_date masih perkiraan (klien belum memastikan). event_date tetap WAJIB terisi supaya cron status, availability, guard bentrok crew, freeze cutoff, dan KPI tetap bekerja; flag ini hanya menandai bahwa angkanya belum final (chip TBC di UI + ikut reminder H-7/H-3).';
