-- 20260926_event_bill_to.sql
-- "Ditujukan kepada" di dokumen event (invoice, nota, BAST, kuitansi):
--   NULL/'auto' = klien + u.p. pembooking, 'client' = klien saja,
--   'booker' = pembooking saja, 'custom' = bill_to_name (+ bill_to_attn).
-- Disimpan di event supaya semua dokumen event itu seragam. Idempotent.
ALTER TABLE events
	ADD COLUMN IF NOT EXISTS bill_to_mode TEXT
		CHECK (bill_to_mode IN ('auto', 'client', 'booker', 'custom')),
	ADD COLUMN IF NOT EXISTS bill_to_name TEXT,
	ADD COLUMN IF NOT EXISTS bill_to_attn TEXT;
