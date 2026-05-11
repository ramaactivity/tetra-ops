-- 20260516_venue_province.sql
-- Tambah kolom venue_province ke events untuk simpan provinsi.
-- Reverse-geocode Nominatim sering hanya kasih kecamatan/desa di field
-- "city" untuk lokasi rural — sekarang kami parse kabupaten + provinsi
-- terpisah biar alamat lengkap (jalan, kec/desa, kab/kota, provinsi).
--
-- Idempotent.

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS venue_province TEXT;

COMMENT ON COLUMN events.venue_province IS
    'Provinsi venue (cth. Jawa Barat). Auto-resolved dari Google Maps URL via Nominatim, override manual tetap bisa.';
