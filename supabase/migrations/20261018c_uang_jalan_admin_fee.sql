-- 20261018c_uang_jalan_admin_fee.sql — biaya admin transfer per baris uang jalan (owner 2026-10-18).
-- Owner yang transfer uang jalan dari rekening pribadi kadang kena admin
-- (beda bank); biaya itu ikut diganti Tetra, jadi saldo hutang ke owner
-- = amount + admin_fee. Kolom aditif; baris lama diisi dari baris 5-600 jurnalnya.
ALTER TABLE uang_jalan ADD COLUMN IF NOT EXISTS admin_fee numeric(14,2) NOT NULL DEFAULT 0;
UPDATE uang_jalan u
SET admin_fee = jl.debit_amount
FROM journal_lines jl
WHERE jl.entry_id = u.journal_id
	AND jl.account_code = '5-600'
	AND u.kind = 'beri'
	AND u.admin_fee = 0;
