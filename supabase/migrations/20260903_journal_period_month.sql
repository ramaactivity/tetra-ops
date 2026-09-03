-- ============================================================================
-- 20260903_journal_period_month.sql
--
-- Periode untuk biaya rutin bulanan (kost, internet, langganan app).
--
-- Tanpa ini, "Bayar kost Rp800.000" pada 6 Agustus tidak bisa dibedakan dari
-- pembayaran bulan berikutnya: yang tercatat cuma tanggal transaksinya, padahal
-- yang penting adalah BULAN YANG DIBAYAR. Akibatnya tidak ada cara memastikan
-- satu bulan sudah/belum dibayar, dan dobel-catat gampang terjadi — persis yang
-- dikhawatirkan owner.
--
-- period_month = tanggal 1 bulan yang dibayar (mis. 2026-09-01 untuk September).
-- NULL untuk transaksi biasa yang memang tidak punya periode.
-- ============================================================================

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS period_month DATE;

ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_period_month_is_first_day;
ALTER TABLE journal_entries ADD CONSTRAINT journal_period_month_is_first_day
  CHECK (period_month IS NULL OR EXTRACT(DAY FROM period_month) = 1);

CREATE INDEX IF NOT EXISTS ix_journal_entries_period_month
  ON journal_entries (period_month)
  WHERE period_month IS NOT NULL;

COMMENT ON COLUMN journal_entries.period_month IS
  'Bulan yang DIBAYAR untuk biaya rutin (kost, internet, langganan) — tanggal 1 bulan bersangkutan. Beda dari entry_date (tanggal transaksinya). Dipakai untuk cek "bulan ini sudah dibayar belum".';
