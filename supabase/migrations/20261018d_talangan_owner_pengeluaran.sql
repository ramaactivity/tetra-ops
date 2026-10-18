-- 20261018d_talangan_owner_pengeluaran.sql — pengeluaran event dibayar owner dulu (owner 2026-10-18).
-- Biaya event (bensin, konsumsi, dll.) yang ditalangi owner bisa dicatat sebagai
-- hutang Tetra ke owner itu dan dilunasi nanti di modul hutang-piutang owner:
--   Catat (sumber "Hutang ke <owner>"): Dr beban / Cr 2-310 + baris 'talangan'
-- talangan_owner_bayar jadi buku besar pembantu 2-310 selain uang jalan:
--   talangan (+, Tetra berutang) · bayar (−) · terima (+, owner setor balik).
-- note = keterangan (apa · acara · kapan) yang ikut ke jurnal pelunasan.
-- Aditif & idempotent.
ALTER TABLE talangan_owner_bayar DROP CONSTRAINT IF EXISTS talangan_owner_bayar_direction_check;
ALTER TABLE talangan_owner_bayar ADD CONSTRAINT talangan_owner_bayar_direction_check
	CHECK (direction IN ('bayar', 'terima', 'talangan'));
ALTER TABLE talangan_owner_bayar ADD COLUMN IF NOT EXISTS note text;
CREATE INDEX IF NOT EXISTS talangan_owner_bayar_journal_idx ON talangan_owner_bayar (journal_id);

-- Antrean settle: pengeluaran yang sumbernya hutang ke owner tertentu.
ALTER TABLE event_settle_queue ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id);
