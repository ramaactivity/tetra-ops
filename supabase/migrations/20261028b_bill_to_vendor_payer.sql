-- 20261028b_bill_to_vendor_payer.sql
-- 1) "Ditujukan kepada" = vendor (WO/EO): tagihan ke vendor yang membawa
--    acara (KEPADA = vendor_name, u.p. = vendor_pic_name). Pelebaran CHECK
--    saja, data lama tidak berubah.
-- 2) payments.payer_name: nama pengirim / pemilik rekening. Kalau diisi,
--    kuitansi "Telah terima dari" memakai nama ini (bukan pihak yang ditagih).
-- Idempotent.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_bill_to_mode_check;
ALTER TABLE events ADD CONSTRAINT events_bill_to_mode_check
	CHECK (bill_to_mode IN ('auto', 'client', 'booker', 'custom', 'vendor'));

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_name TEXT;
COMMENT ON COLUMN payments.payer_name IS
	'Nama pengirim / pemilik rekening. Kuitansi "Telah terima dari" memakai ini bila diisi.';
