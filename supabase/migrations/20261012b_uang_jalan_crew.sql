-- 20261012b_uang_jalan_crew.sql
-- Uang jalan crew (petty cash per acara, permintaan owner 2026-10-10).
-- Owner memberi uang di muka (tunai / transfer / top-up GoPay) untuk bensin,
-- parkir, tol, transport online, dll. Pengeluaran crew tetap dicatat seperti
-- biasa (ditalangi crew → reimbursement di 2-100 saat settle). Uang jalan =
-- piutang ke crew (1-320) yang:
--   • habis dipotong saat bayar fee (Cr 1-320, transfer owner = fee + reimb − sisa), atau
--   • sisanya dikembalikan crew ke owner (Dr kas / Cr 1-320).
-- Tidak mengubah settle_event: akuntansinya lewat jurnal terpisah.
-- Idempotent & aditif.

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES ('1-320', 'Uang Jalan Crew', 'asset', '1-000', true,
        'Uang yang dititipkan owner ke crew sebelum acara (bensin, parkir, tol, transport). Habis saat dipotong dari fee crew atau sisanya dikembalikan.')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = true;

-- Buku uang jalan per acara per crew. Saldo = Σberi − Σkembali − Σpotong_fee (yang tidak dibatalkan).
CREATE TABLE IF NOT EXISTS uang_jalan (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_id uuid NOT NULL REFERENCES events(id),
	user_id uuid NOT NULL REFERENCES users(id),
	kind text NOT NULL CHECK (kind IN ('beri', 'kembali', 'potong_fee')),
	amount numeric(14,2) NOT NULL CHECK (amount > 0),
	method text CHECK (method IN ('tunai', 'transfer')),
	account_code text,
	journal_id uuid REFERENCES journal_entries(id),
	is_reversed boolean NOT NULL DEFAULT false,
	note text,
	created_by uuid REFERENCES users(id),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uang_jalan_event_user_idx ON uang_jalan (event_id, user_id);
ALTER TABLE uang_jalan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uang_jalan_owner_all ON uang_jalan;
CREATE POLICY uang_jalan_owner_all ON uang_jalan FOR ALL USING (is_owner_level()) WITH CHECK (is_owner_level());

-- Laporan crew di rekap: berapa uang jalan yang diterima & mau diapakan sisanya.
ALTER TABLE crew_rekap
	ADD COLUMN IF NOT EXISTS uj_terima numeric(14,2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS uj_metode text,
	ADD COLUMN IF NOT EXISTS uj_holder uuid REFERENCES users(id),
	ADD COLUMN IF NOT EXISTS uj_sisa text;
DO $$ BEGIN
	ALTER TABLE crew_rekap ADD CONSTRAINT crew_rekap_uj_metode_check CHECK (uj_metode IS NULL OR uj_metode IN ('tunai', 'transfer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	ALTER TABLE crew_rekap ADD CONSTRAINT crew_rekap_uj_sisa_check CHECK (uj_sisa IS NULL OR uj_sisa IN ('potong_fee', 'kembalikan'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
