-- ============================================================================
-- 20260903b_backfill_period_month.sql
--
-- Isi period_month untuk jurnal biaya rutin yang sudah terlanjur tercatat.
--
-- Tanpa ini peringatan "bulan ini sudah dibayar" tidak akan menyala untuk kost
-- Juli/Agustus & internet yang sudah ada — padahal justru itu yang paling rawan
-- dobel saat mencatat bulan berikutnya.
--
-- ASUMSI: pembayaran dilakukan pada bulan yang dibayar (period = bulan dari
-- entry_date). Benar untuk semua baris yang ada sekarang (kost & internet
-- dibayar di bulan berjalan). Kolomnya hanya dipakai untuk peringatan dobel —
-- tidak memengaruhi satu angka pun di pembukuan.
-- ============================================================================

UPDATE journal_entries je
SET period_month = date_trunc('month', je.entry_date)::date
WHERE je.period_month IS NULL
  AND je.is_reversed = false
  AND je.source_type IN ('manual', 'owner_patungan')
  AND EXISTS (
    SELECT 1 FROM journal_lines jl
    WHERE jl.entry_id = je.id
      AND jl.account_code IN ('5-260', '5-270', '5-400')
  );
