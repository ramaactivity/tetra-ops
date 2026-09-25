-- 20260925_event_client_org_title.sql
-- Pisahkan tiga nama yang dulu tercampur di events.client_name:
--   client_org  = KLIEN (perusahaan / instansi / sekolah / pengantin / yang ultah)
--   event_title = NAMA ACARA ("Annual Gathering 2026", "Sweet 17")
--   booker_name = PEMBOOKING (orang yang menghubungi Tetra) — sudah ada.
-- client_name tetap = judul event di daftar/bot/notif, dirangkai dari
-- client_org + event_title oleh form booking. Idempotent.

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS client_org TEXT,
	ADD COLUMN IF NOT EXISTS event_title TEXT;

COMMENT ON COLUMN events.client_org IS
	'Klien: perusahaan/instansi/sekolah, atau pengantin/yang ultah untuk acara pribadi. Tujuan KEPADA di invoice.';
COMMENT ON COLUMN events.event_title IS
	'Nama acara (opsional). client_name = judul gabungan client_org + event_title.';

-- Backfill hanya baris yang belum diisi.
-- 1) "Klien — Acara" → pecah dua.
UPDATE events
SET client_org = trim(split_part(client_name, ' — ', 1)),
	event_title = nullif(trim(substr(client_name, strpos(client_name, ' — ') + 3)), '')
WHERE client_org IS NULL AND event_title IS NULL
	AND strpos(client_name, ' — ') > 0;

-- 2) Pernikahan: judul = nama pengantin = klien.
UPDATE events
SET client_org = client_name
WHERE client_org IS NULL AND event_title IS NULL
	AND event_category IN ('wedding', 'pernikahan');

-- 3) Sisanya: judul lama adalah nama acara; klien menyusul diisi owner.
UPDATE events
SET event_title = client_name
WHERE client_org IS NULL AND event_title IS NULL;
