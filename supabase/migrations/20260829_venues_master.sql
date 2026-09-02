-- ============================================================================
-- 20260829_venues_master.sql — master venue, meniru pola master vendor.
--
-- Masalah: venue selama ini cuma empat kolom teks bebas di `events`, diketik
-- ulang tiap booking. Akibatnya (audit 28 Agu 2026, 154 event):
--   • 115 nama unik, 15 di antaranya dipakai berulang
--   • "Grand Savero" dipakai 14×, tapi link Google Maps-nya cuma terisi 3×
--     dan kotanya 2×
--   • Total: Maps terisi 50/154, kota 40/154
-- Bukan karena malas — karena tiap booking mulai dari kosong. Nama pun mudah
-- melenceng ("Grand Savero" vs "Grand Savero Hotel") sehingga riwayat venue
-- yang sama tidak pernah nyambung.
--
-- Perlakuan: satu baris master per venue. Booking memilihnya dari daftar dan
-- alamat/kota/provinsi/Maps ikut terisi; venue baru cukup diketik dan otomatis
-- masuk master saat simpan — persis seperti vendor.
--
-- Kolom venue_* di `events` SENGAJA dipertahankan: itu potret venue saat event
-- berlangsung. Kalau alamat venue berubah tahun depan, event lama tidak boleh
-- ikut berubah. Sama seperti vendor (vendor_contact_id + kolom denormalisasi).
--
-- Idempotent — aman dijalankan ulang.
-- ============================================================================

CREATE TABLE IF NOT EXISTS venues (
	id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
	name TEXT NOT NULL,
	address TEXT,
	city TEXT,
	province TEXT,
	google_maps_url TEXT,
	google_maps_lat NUMERIC,
	google_maps_lng NUMERIC,
	notes TEXT,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE venues IS
	'Master venue. Booking memilih dari sini lalu alamat/kota/provinsi/Maps auto-terisi; nama baru auto-create saat simpan. Kolom venue_* di events tetap jadi potret saat event berlangsung.';

-- Nama venue dianggap sama walau beda kapital/spasi — inilah yang membuat
-- "grand savero" dan "Grand Savero " tidak jadi dua baris master.
CREATE UNIQUE INDEX IF NOT EXISTS venues_name_unique_active
	ON venues (LOWER(BTRIM(name)))
	WHERE is_active;

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_venue_id_idx ON events (venue_id);

COMMENT ON COLUMN events.venue_id IS
	'FK ke master venue. Kolom venue_name/address/city/province tetap diisi sebagai potret saat event — jangan dibaca dari master untuk event lama.';

-- ---------------------------------------------------------------------------
-- RLS — sama persis dengan master vendor (contacts)
-- ---------------------------------------------------------------------------
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venues_read_owner ON venues;
CREATE POLICY venues_read_owner ON venues FOR SELECT USING (is_owner_level());

DROP POLICY IF EXISTS venues_write_owner ON venues;
CREATE POLICY venues_write_owner ON venues FOR ALL
	USING (
		EXISTS (
			SELECT 1 FROM users u
			WHERE u.id = auth.uid()
			  AND u.role = ANY (ARRAY['super_admin'::user_role, 'owner'::user_role])
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM users u
			WHERE u.id = auth.uid()
			  AND u.role = ANY (ARRAY['super_admin'::user_role, 'owner'::user_role])
		)
	);

-- ---------------------------------------------------------------------------
-- Backfill dari event yang sudah ada
-- ---------------------------------------------------------------------------
-- Satu baris master per nama venue, diambil dari event yang datanya PALING
-- LENGKAP — bukan yang terbaru. Untuk "Grand Savero" itu berarti mengambil
-- link Maps dari 3 event yang punya, bukan dari 11 event yang kosong.
--
-- Nama yang dipakai: ejaan dari baris terlengkap itu juga, supaya master tidak
-- menyimpan varian yang paling miskin datanya.
WITH ranked AS (
	SELECT DISTINCT ON (LOWER(BTRIM(e.venue_name)))
		BTRIM(e.venue_name)  AS name,
		NULLIF(BTRIM(COALESCE(e.venue_address, '')), '')  AS address,
		NULLIF(BTRIM(COALESCE(e.venue_city, '')), '')     AS city,
		NULLIF(BTRIM(COALESCE(e.venue_province, '')), '') AS province,
		NULLIF(BTRIM(COALESCE(e.google_maps_url, '')), '') AS google_maps_url,
		e.google_maps_lat,
		e.google_maps_lng
	FROM events e
	WHERE NULLIF(BTRIM(COALESCE(e.venue_name, '')), '') IS NOT NULL
	ORDER BY
		LOWER(BTRIM(e.venue_name)),
		(NULLIF(BTRIM(COALESCE(e.google_maps_url, '')), '') IS NOT NULL) DESC,
		(NULLIF(BTRIM(COALESCE(e.venue_city, '')), '') IS NOT NULL) DESC,
		(NULLIF(BTRIM(COALESCE(e.venue_province, '')), '') IS NOT NULL) DESC,
		(NULLIF(BTRIM(COALESCE(e.venue_address, '')), '') IS NOT NULL) DESC,
		e.event_date DESC NULLS LAST
)
INSERT INTO venues (name, address, city, province, google_maps_url, google_maps_lat, google_maps_lng)
SELECT name, address, city, province, google_maps_url, google_maps_lat, google_maps_lng
FROM ranked
ON CONFLICT DO NOTHING;

-- Tautkan event lama ke master-nya (pencocokan nama, case-insensitive).
UPDATE events e
SET venue_id = v.id
FROM venues v
WHERE e.venue_id IS NULL
  AND NULLIF(BTRIM(COALESCE(e.venue_name, '')), '') IS NOT NULL
  AND LOWER(BTRIM(e.venue_name)) = LOWER(BTRIM(v.name));
