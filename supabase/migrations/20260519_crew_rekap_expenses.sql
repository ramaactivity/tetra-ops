-- 20260519_crew_rekap_expenses.sql
-- Phase F1: Add field-expense columns to crew_rekap supaya crew bisa input
-- biaya operasional lapangan (transport gocar/rental, bensin, toll, parkir,
-- konsumsi, lainnya). P&L per event jadi clear: HPP (consumable+bonus) +
-- OpEx (fee crew adj + field expense + sewa) → Gross Profit.
--
-- Schema decision (user keputusan):
--   • Typed columns for stable categories (transport_*, bensin, toll, parking, konsumsi)
--   • JSONB list `lainnya_items` untuk repeatable misc costs
--   • Transport method enum (online/rental/none) drives conditional fields:
--       - online: transport_cost + proof berangkat + proof pulang (gocar/grabcar)
--       - rental: transport_cost + bensin_cost (sewa mobil + isi bensin)
--       - none: no transport cost
--   • Toll + parkir always available (kedua skema bisa kena)
--
-- Idempotent — semua ADD COLUMN IF NOT EXISTS.

ALTER TABLE crew_rekap
	ADD COLUMN IF NOT EXISTS transport_method TEXT
		CHECK (transport_method IN ('online', 'rental', 'none') OR transport_method IS NULL),
	ADD COLUMN IF NOT EXISTS transport_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS transport_proof_berangkat_url TEXT,
	ADD COLUMN IF NOT EXISTS transport_proof_pulang_url TEXT,
	ADD COLUMN IF NOT EXISTS bensin_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS toll_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS parking_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS konsumsi_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS lainnya_items JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN crew_rekap.transport_method IS
	'online = gocar/grab (proof berangkat+pulang). rental = sewa mobil (bensin_cost active). none = no transport.';
COMMENT ON COLUMN crew_rekap.transport_cost IS
	'Total transport cost (online: kedua trip combined. rental: harga sewa mobil).';
COMMENT ON COLUMN crew_rekap.bensin_cost IS
	'BBM cost untuk rental mobil. 0 kalau transport_method != rental.';
COMMENT ON COLUMN crew_rekap.lainnya_items IS
	'Repeatable misc costs: [{note: string, amount: number}]. Cap 20 items app-side.';
