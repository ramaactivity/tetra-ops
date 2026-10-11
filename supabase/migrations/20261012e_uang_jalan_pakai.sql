-- 20261012e_uang_jalan_pakai.sql — pengeluaran event dibayar pakai uang jalan (owner 2026-10-11).
-- "Pemasukan / pengeluaran lain" boleh memilih sumber "Uang jalan · <crew>":
-- dibukukan saat settle Dr beban / Cr 1-320, lalu buku uang jalan mencatat
-- kind 'pakai' sehingga saldo yang dipegang crew berkurang. Aditif.
ALTER TABLE uang_jalan DROP CONSTRAINT IF EXISTS uang_jalan_kind_check;
ALTER TABLE uang_jalan ADD CONSTRAINT uang_jalan_kind_check
	CHECK (kind IN ('beri', 'kembali', 'potong_fee', 'pakai'));
ALTER TABLE event_settle_queue ADD COLUMN IF NOT EXISTS uj_user_id uuid REFERENCES users(id);
