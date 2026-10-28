-- 20261028_event_extra_pics.sql
-- PIC cadangan di lokasi: crew punya kontak lain kalau PIC utama slow respon.
-- PIC utama tetap events.pic_name/pic_wa (semua pembaca lama tidak berubah).
-- Format: [{name, wa}] — dibaca lewat src/lib/events/extra-pics.ts. Idempotent.
ALTER TABLE events
	ADD COLUMN IF NOT EXISTS extra_pics jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN events.extra_pics IS
	'PIC cadangan di lokasi: [{name, wa}] selain pic_name/pic_wa (PIC utama).';
