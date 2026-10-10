-- 20261012c_gallery_expiry.sql
-- Pengingat galeri klien mau habis (H-7 & H-1 sebelum client_expires_at Booth),
-- pipeline sama dengan galeri-klien (event_messages, idempoten per nomor).
ALTER TABLE event_messages DROP CONSTRAINT IF EXISTS event_messages_kind_check;
ALTER TABLE event_messages ADD CONSTRAINT event_messages_kind_check
	CHECK (kind IN ('galeri', 'galeri_kosong', 'galeri_h7', 'galeri_h1'));
INSERT INTO system_config (key, value, description, category)
VALUES ('gallery_expiry_enabled', 'false'::jsonb, 'Pengingat galeri klien mau habis (H-7 & H-1, 10.00 WIB)', 'notifikasi')
ON CONFLICT (key) DO NOTHING;
