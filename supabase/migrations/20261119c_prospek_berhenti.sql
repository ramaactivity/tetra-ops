-- Prospek status `berhenti` (terminal): jangan di-follow-up lagi. Rama 19 Nov:
-- "kalau udah 3x ga dibalas yaudah jangan di followup lagi … kalau mau
-- lanjutin cari yang baru" (audit Bruno, kartu Hermes t_951a932f). Beda dengan
-- tolak / jangan_hubungi (keputusan klien); berhenti = keputusan kita. Aditif.
ALTER TABLE prospek DROP CONSTRAINT IF EXISTS prospek_status_check;
ALTER TABLE prospek ADD CONSTRAINT prospek_status_check
	CHECK (status IN ('kandidat', 'disapa', 'follow_up', 'membalas', 'deal', 'tolak', 'jangan_hubungi', 'berhenti'));
ALTER TABLE prospek ADD COLUMN IF NOT EXISTS alasan_berhenti text
	CHECK (alasan_berhenti IN ('tak_dibalas_3x', 'menolak', 'ooo_lama', 'intake_bukan_pic'));
ALTER TABLE prospek ADD COLUMN IF NOT EXISTS berhenti_at timestamptz;
