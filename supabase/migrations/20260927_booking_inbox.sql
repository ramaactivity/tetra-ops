-- 20260927_booking_inbox.sql
-- "Booking Masuk": booking yang sudah DP dari bot WA, menunggu owner membuat
-- event-nya. Bot menulis lewat POST /api/bot/booking (admin client, upsert per
-- external_id); owner membaca/mengubah lewat app. Tidak ada hapus — batal =
-- status 'dibatalkan'. Bot tidak pernah membuat event / mencatat pembayaran.
-- Idempotent.

CREATE TABLE IF NOT EXISTS booking_inbox (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	external_id text NOT NULL UNIQUE,
	wa_jid text NOT NULL,
	client_wa text,
	client_name text,
	sumber text CHECK (sumber IN ('bukti-transfer', 'admin')),
	dp_dilaporkan_at timestamptz,
	bukti_url text,
	data jsonb NOT NULL DEFAULT '{}'::jsonb,
	lengkap boolean NOT NULL DEFAULT false,
	status text NOT NULL DEFAULT 'baru'
		CHECK (status IN ('baru', 'diproses', 'jadi_event', 'dibatalkan')),
	event_id uuid REFERENCES events(id),
	berubah_setelah_event boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	updated_by uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS booking_inbox_status_idx
	ON booking_inbox (status, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_inbox_event_idx
	ON booking_inbox (event_id) WHERE event_id IS NOT NULL;

DROP TRIGGER IF EXISTS booking_inbox_updated_at ON booking_inbox;
CREATE TRIGGER booking_inbox_updated_at BEFORE UPDATE ON booking_inbox
	FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: owner/super_admin saja. Tanpa policy DELETE → tidak ada hapus via app.
ALTER TABLE booking_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_inbox_owner_select ON booking_inbox;
CREATE POLICY booking_inbox_owner_select ON booking_inbox FOR SELECT
	USING (is_owner_level());

DROP POLICY IF EXISTS booking_inbox_owner_update ON booking_inbox;
CREATE POLICY booking_inbox_owner_update ON booking_inbox FOR UPDATE
	USING (is_owner_level()) WITH CHECK (is_owner_level());
