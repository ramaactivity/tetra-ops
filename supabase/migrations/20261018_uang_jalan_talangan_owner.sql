-- 20261018_uang_jalan_talangan_owner.sql — siapa yang memberi uang jalan (owner 2026-10-18).
-- Uang jalan sering ditransfer owner (Rama/Adit/Fahmi/Iqbal) dari uang PRIBADI,
-- kadang beberapa kali per acara. Dicatat siapa pemberinya; kalau dari uang
-- pribadi, perusahaan berutang ke owner itu:
--   beri  pribadi : Dr 1-320 / Cr 2-310 (saldo rekening Tetra tidak berubah)
--   kembali ke owner: Dr 2-310 / Cr 1-320 (crew balikin sisa langsung ke owner)
--   ganti ke owner  : Dr 2-310 / Cr kas-bank → uang_jalan.ganti_journal_id diisi
-- Aditif & idempotent.

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES ('2-310', 'Hutang Talangan Owner', 'liability', '2-000', true,
        'Uang pribadi owner yang dipakai perusahaan (mis. uang jalan crew) dan belum diganti.')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = true;

ALTER TABLE uang_jalan
	ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id),
	ADD COLUMN IF NOT EXISTS ganti_journal_id uuid REFERENCES journal_entries(id);
COMMENT ON COLUMN uang_jalan.owner_id IS 'Owner yang memberi (beri) / menerima sisa (kembali).';
COMMENT ON COLUMN uang_jalan.ganti_journal_id IS 'Jurnal penggantian ke owner (hanya baris account_code 2-310).';
CREATE INDEX IF NOT EXISTS uang_jalan_talangan_open_idx ON uang_jalan (owner_id)
	WHERE account_code = '2-310' AND ganti_journal_id IS NULL AND NOT is_reversed;
