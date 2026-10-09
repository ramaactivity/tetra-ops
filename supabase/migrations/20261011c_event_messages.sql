-- 20261011c_event_messages.sql
-- Pesan otomatis sesudah acara: pengingat crew (selesai+30') dan galeri ke klien.
-- crew_briefings: jenis 'selesai' ditambahkan. event_messages: satu baris per
-- (event, jenis, tujuan) — kunci idempoten pesan galeri per nomor + peringatan owner.
ALTER TABLE crew_briefings DROP CONSTRAINT IF EXISTS crew_briefings_kind_check;
ALTER TABLE crew_briefings ADD CONSTRAINT crew_briefings_kind_check
	CHECK (kind IN ('h1', 'hari_h', 'selesai'));

CREATE TABLE IF NOT EXISTS event_messages (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('galeri', 'galeri_kosong')),
	target text NOT NULL, -- nomor WA (628…) atau 'owner'
	command_id uuid,
	sent_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (event_id, kind, target)
);
ALTER TABLE event_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_messages_owner_select ON event_messages;
CREATE POLICY event_messages_owner_select ON event_messages FOR SELECT USING (is_owner_level());
