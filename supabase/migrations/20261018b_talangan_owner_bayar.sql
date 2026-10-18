-- 20261018b_talangan_owner_bayar.sql — hutang-piutang Tetra ↔ owner bisa dicicil (owner 2026-10-18).
-- Saldo per owner = Σ uang jalan dari uang pribadi owner (beri +, sisa yang crew
-- kembalikan ke owner −) − Σ bayar ke owner + Σ terima dari owner.
-- Positif = Tetra berutang ke owner; negatif = owner berutang ke Tetra.
--   bayar  : Dr 2-310 / Cr kas-bank   (Tetra transfer ke owner, boleh sebagian)
--   terima : Dr kas-bank / Cr 2-310   (owner setor balik ke Tetra)
-- Menggantikan uang_jalan.ganti_journal_id (dibuat 20261018, belum pernah terisi)
-- yang hanya bisa melunasi per baris, tidak bisa dicicil.

CREATE TABLE IF NOT EXISTS talangan_owner_bayar (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_id uuid NOT NULL REFERENCES users(id),
	direction text NOT NULL CHECK (direction IN ('bayar', 'terima')),
	amount numeric(14,2) NOT NULL CHECK (amount > 0),
	account_code text NOT NULL,
	journal_id uuid REFERENCES journal_entries(id),
	event_id uuid REFERENCES events(id),
	is_reversed boolean NOT NULL DEFAULT false,
	created_by uuid REFERENCES users(id),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS talangan_owner_bayar_owner_idx ON talangan_owner_bayar (owner_id);
ALTER TABLE talangan_owner_bayar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS talangan_owner_bayar_owner_all ON talangan_owner_bayar;
CREATE POLICY talangan_owner_bayar_owner_all ON talangan_owner_bayar FOR ALL
	USING (is_owner_level()) WITH CHECK (is_owner_level());

DROP INDEX IF EXISTS uang_jalan_talangan_open_idx;
ALTER TABLE uang_jalan DROP COLUMN IF EXISTS ganti_journal_id;
CREATE INDEX IF NOT EXISTS uang_jalan_talangan_idx ON uang_jalan (owner_id)
	WHERE account_code = '2-310';
