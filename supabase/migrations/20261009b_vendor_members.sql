-- Migration: dasbor rekanan (owner 9 Okt 2026). Orang portal ↔ kontak vendor.
-- Satu undangan per vendor: semua event dengan events.vendor_contact_id = kontak ini
-- (lampau + mendatang + yang dibuat nanti) muncul di dasbor orang itu sebagai WO.
-- RLS: hanya service role (portal memakai admin client + cek keanggotaan di kode). Idempotent.
CREATE TABLE IF NOT EXISTS vendor_members (
	contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
	person_id uuid NOT NULL REFERENCES portal_people(id) ON DELETE CASCADE,
	invited_by uuid REFERENCES users(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (contact_id, person_id)
);
CREATE INDEX IF NOT EXISTS vendor_members_person_idx ON vendor_members (person_id);
ALTER TABLE vendor_members ENABLE ROW LEVEL SECURITY;
