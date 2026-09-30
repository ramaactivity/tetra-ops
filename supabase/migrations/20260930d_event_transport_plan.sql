-- ============================================================================
-- 20260930d_event_transport_plan.sql — rencana transport event diisi owner.
--
-- Owner yang assign crew sekalian menentukan: event ini pakai mobil sewa atau
-- transportasi online. Kalau sewa: mobil siapa (master transport_vehicles,
-- bisa ditambah) + harga sewa + nota (opsional, sering baru ada setelah mobil
-- dikembalikan). Rekap crew ikut terisi otomatis — sewa = dibayar owner,
-- crew tidak perlu mengisi ulang.
--
-- Idempotent — aman dijalankan ulang.
-- ============================================================================

CREATE TABLE IF NOT EXISTS transport_vehicles (
	id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
	name TEXT NOT NULL,
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS transport_vehicles_name_unique
	ON transport_vehicles (LOWER(BTRIM(name)));

INSERT INTO transport_vehicles (name) VALUES
	('Mobil Singgih'),
	('Mobil Sodara Mou')
ON CONFLICT DO NOTHING;

ALTER TABLE transport_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transport_vehicles_read ON transport_vehicles;
CREATE POLICY transport_vehicles_read ON transport_vehicles FOR SELECT
	USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS transport_vehicles_write_owner ON transport_vehicles;
CREATE POLICY transport_vehicles_write_owner ON transport_vehicles FOR ALL
	USING (is_owner_level())
	WITH CHECK (is_owner_level());

ALTER TABLE events
	ADD COLUMN IF NOT EXISTS transport_mode TEXT
		CHECK (transport_mode IN ('rental', 'online')),
	ADD COLUMN IF NOT EXISTS transport_vehicle TEXT,
	ADD COLUMN IF NOT EXISTS transport_rental_cost INTEGER
		CHECK (transport_rental_cost IS NULL OR transport_rental_cost >= 0),
	ADD COLUMN IF NOT EXISTS transport_nota_url TEXT;

COMMENT ON COLUMN events.transport_mode IS
	'Rencana transport dari owner: rental (mobil sewa, dibayar owner) | online (gocar dsb, crew isi ongkos di rekap) | NULL (belum ditentukan).';
COMMENT ON COLUMN events.transport_vehicle IS
	'Nama mobil sewa (potret dari transport_vehicles).';
