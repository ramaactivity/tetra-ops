-- 20261018i_event_compliment.sql — acara compliment / gratis (owner 2026-10-18).
-- Contoh: pernikahan owner sendiri. Biayanya tetap biaya nyata Tetra (bahan,
-- fee crew) yang ditanggung bersama lewat laba — pembukuan TIDAK berubah.
-- Penanda ini hanya membuat tampilan & peringatan membacanya sebagai
-- "Biaya compliment" (hadiah dari Tetra), bukan "Rugi event". Aditif.
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_compliment boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN events.is_compliment IS
	'Acara gratis / hadiah dari Tetra: rugi = biaya compliment (bukan alarm rugi). Pembukuan tetap normal.';
