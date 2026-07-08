-- 20260708_events_session_segments.sql
-- ============================================================================
-- Acara dengan JEDA (multi-sesi) — booth buka → tutup → buka lagi.
--
-- Rationale:
--   Klien kadang minta booth beroperasi dalam beberapa sesi dengan jeda di
--   tengah (mis. buka pas cocktail 17:30-18:30, jeda pas dinner, buka lagi
--   19:00-23:00). Durasi paket dihitung dari JAM AKTIF booth (1 + 4 = 5 jam);
--   jeda-nya tentatif sesuai nego, tidak dihitung sebagai jam aktif.
--
-- Model:
--   • `start_time` / `end_time` TETAP dipakai sebagai RENTANG KESELURUHAN acara
--     (start = mulai sesi pertama, end = selesai sesi terakhir). Semua pembaca
--     lama (dashboard, kalender, billing, PDF, ~30 tempat) otomatis tetap benar.
--   • Kolom baru `session_segments` (JSONB) menyimpan window aktif per-sesi:
--       [{ "start": "17:30", "end": "18:30" }, { "start": "19:00", "end": "23:00" }]
--     NULL / [] = acara normal satu blok (seperti sekarang, no jeda). Jeda antar
--     sesi DITURUNKAN dari selisih (bukan disimpan) → fleksibel sesuai nego.
--
-- Impact:
--   ADDITIVE & backward-compatible — semua data existing tidak berubah
--   (session_segments default NULL = acara satu blok).
-- ============================================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS session_segments JSONB;

COMMENT ON COLUMN events.session_segments IS
  'Window aktif booth per-sesi utk acara dengan jeda: [{start:"HH:MM",end:"HH:MM"}]. NULL/[] = satu blok (start_time..end_time). Jeda antar-sesi diturunkan dari selisih.';
