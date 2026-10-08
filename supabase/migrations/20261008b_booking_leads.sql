-- Lead wizard booking: klien yang sudah verifikasi WA tapi belum menekan
-- "Kirim booking". Satu baris aktif per orang; diperbarui saat klien lanjut
-- mengisi; converted_booking_id diisi saat booking terkirim. Hanya owner
-- yang membaca (follow-up dari /operations/portal). Aditif & idempoten.
CREATE TABLE IF NOT EXISTS booking_leads (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	person_id uuid NOT NULL REFERENCES portal_people(id) ON DELETE CASCADE,
	snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, -- ringkasan isian wizard (tanpa harga final)
	last_screen text,
	converted_booking_id uuid REFERENCES client_bookings(id) ON DELETE SET NULL,
	followed_up_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS booking_leads_open_person
	ON booking_leads (person_id) WHERE converted_booking_id IS NULL;
CREATE INDEX IF NOT EXISTS booking_leads_updated_idx ON booking_leads (updated_at DESC);

ALTER TABLE booking_leads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
	CREATE POLICY booking_leads_owner_select ON booking_leads FOR SELECT USING (is_owner_level());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE POLICY booking_leads_owner_update ON booking_leads FOR UPDATE USING (is_owner_level());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
