-- 20260808_frame_package_sync.sql
-- ============================================================================
-- Frame size ↔ paket harus sinkron + desain sebagai gate terakhir.
-- ============================================================================
--
-- Kejadian 8 Agustus 2026 (Hidayat & Uci): frame size event masih "menyusul"
-- tapi paket yang terpilih "2R Unlimited 2 Jam". Klien ternyata minta 4R.
-- Datanya sendiri sudah saling bertentangan sejak booking — tidak ada yang
-- bisa mendeteksinya, dan baru ketahuan di hari-H.
--
-- Tiga kolom baru, masing-masing menutup satu celah:
--
-- 1. events.pending_package_hours
--    Saat frame size belum pasti, owner TIDAK boleh memilih paket ber-ukuran.
--    Yang dipilih hanya DURASI-nya ("2 Jam"), disimpan di sini dengan
--    package_id tetap NULL. Aman secara harga: di pricelist photobooth
--    classic, 2R/4R/Polaroid dengan durasi sama harganya identik — jadi
--    nominal booking tidak berubah saat ukuran nanti dipastikan. Begitu frame
--    size diisi, sistem menukar ini jadi package_id yang konkret dan kolomnya
--    dikosongkan lagi.
--
-- 2. events.design_frame_size + design_approved_by
--    Desainer adalah gate terakhir sebelum cetak. Saat menandai desain
--    "Approved" dia wajib menyatakan ukuran file yang dia buat; ukuran itu
--    disimpan di sini supaya beda-ukuran tidak bisa lolos diam-diam dan
--    jejaknya bisa ditelusuri (siapa yang meng-ACC, ukuran apa).
--
-- 3. telegram_settings.design_pic_*
--    Tujuan mention di grup owner untuk reminder "desain belum ACC".
--    Diisi lewat perintah /desainer yang diketik orangnya sendiri di grup —
--    Telegram tidak memberi tahu user_id seseorang lewat cara lain, dan
--    mention berbasis @username gagal untuk akun tanpa username.
--
-- Idempotent.

-- ── 1. Paket sementara: durasi saja, ukuran menyusul ────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS pending_package_hours INTEGER;

COMMENT ON COLUMN events.pending_package_hours IS
  'Durasi paket yang sudah disepakati saat frame size MASIH menyusul (package_id NULL). Harga per durasi sama untuk semua ukuran, jadi nominal tidak berubah saat ukuran dipastikan. Diisi hanya oleh jalur booking; dikosongkan otomatis begitu frame size terisi dan paket konkret terpilih.';

-- Paket bertaruh pada ukuran: tidak boleh ada paket konkret DAN durasi
-- sementara sekaligus (dua sumber kebenaran → persis bug yang mau dicegah).
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_pending_package_hours_exclusive;
ALTER TABLE events
  ADD CONSTRAINT events_pending_package_hours_exclusive
  CHECK (pending_package_hours IS NULL OR package_id IS NULL);

-- ── 2. Ukuran desain yang di-ACC desainer ───────────────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS design_frame_size TEXT;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_design_frame_size_valid;
ALTER TABLE events
  ADD CONSTRAINT events_design_frame_size_valid
  CHECK (design_frame_size IS NULL OR design_frame_size IN ('2R', '4R', 'polaroid', 'none'));

COMMENT ON COLUMN events.design_frame_size IS
  'Ukuran file desain yang dinyatakan desainer saat meng-ACC (gate terakhir sebelum cetak). Harus sama dengan events.frame_size — kalau beda, aplikasi menolak ACC dan menawarkan koreksi paket/frame di tempat.';

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS design_approved_by UUID REFERENCES users(id);

COMMENT ON COLUMN events.design_approved_by IS
  'Siapa yang menyatakan desain siap cetak (pasangan design_approved_at + design_frame_size).';

-- ── 3. PIC desain untuk mention di grup Telegram ────────────────────────────

ALTER TABLE telegram_settings
  ADD COLUMN IF NOT EXISTS design_pic_user_id BIGINT;
ALTER TABLE telegram_settings
  ADD COLUMN IF NOT EXISTS design_pic_name TEXT;

COMMENT ON COLUMN telegram_settings.design_pic_user_id IS
  'Telegram user_id PIC desain — dipakai mention <a href="tg://user?id=...">. Diisi lewat perintah /desainer yang diketik orangnya sendiri di grup (satu-satunya cara dapat user_id yang pasti, dan tetap jalan untuk akun tanpa @username).';
