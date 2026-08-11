-- 20260811_telegram_prep_pic.sql
-- ============================================================================
-- PIC alat & bahan untuk mention di briefing H-1.
-- ============================================================================
--
-- Ukuran cetak menentukan tiga barang fisik sekaligus: frame, sleeve, dan
-- media set. Yang men-ACC ukuran file adalah PIC desain (telegram_settings.
-- design_pic_*, migration 20260808), tapi yang mengambil barangnya dari gudang
-- orang lain — dan justru di situ ukuran bisa salah walau datanya benar.
-- Kolom ini menyimpan tujuan mention-nya, diisi lewat perintah /alat yang
-- diketik orangnya sendiri di grup (satu-satunya cara dapat user_id Telegram
-- yang pasti; mention @username gagal untuk akun tanpa username).
--
-- Idempotent.

ALTER TABLE telegram_settings
  ADD COLUMN IF NOT EXISTS prep_pic_user_id BIGINT;
ALTER TABLE telegram_settings
  ADD COLUMN IF NOT EXISTS prep_pic_name TEXT;

COMMENT ON COLUMN telegram_settings.prep_pic_user_id IS
  'Telegram user_id PIC alat & bahan — di-mention di blok "CEK UKURAN sebelum packing" pada briefing H-1. Diisi lewat perintah /alat di grup owner.';
