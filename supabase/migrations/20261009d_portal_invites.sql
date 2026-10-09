-- Migration: link undangan pribadi portal (owner 9 Okt 2026). Undangan WA berisi
-- /akun/masuk/<token>: halaman sambutan sesuai penerima → tombol "Buka" langsung membuat sesi
-- (tanpa kode WA). Token disimpan sebagai hash; berlaku 14 hari, boleh dipakai ulang
-- (HP lain) selama belum kedaluwarsa. Login baru terjadi lewat tombol (POST), bukan saat
-- link dibuka, jadi pratinjau link WhatsApp tidak memakai/menghabiskannya. Service role saja.
CREATE TABLE IF NOT EXISTS portal_invites (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	token_hash text NOT NULL UNIQUE,
	person_id uuid NOT NULL REFERENCES portal_people(id) ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('vendor', 'klien', 'anggota')),
	-- { title, vendor_name, booking_code, invited_by, role_label, events }
	context jsonb NOT NULL DEFAULT '{}'::jsonb,
	expires_at timestamptz NOT NULL,
	used_count int NOT NULL DEFAULT 0,
	last_used_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_invites_person_idx ON portal_invites (person_id);
ALTER TABLE portal_invites ENABLE ROW LEVEL SECURITY;
