-- ============================================================================
-- 20260903c_backfill_journal_proof_from_notas.sql
--
-- Tautkan bukti yang sudah ada di manual_notas ke jurnalnya.
--
-- manual_notas.entry_ref_id sudah menunjuk ke jurnalnya sejak awal, tapi
-- journal_entries.proof_url (kolom baru) belum pernah diisi dari sana — jadi
-- 64 nota yang sudah diunggah tidak kelihatan dari halaman Jurnal, padahal
-- filenya ada. Ini murni menautkan yang sudah ada; tidak ada file baru,
-- tidak ada angka yang berubah.
--
-- Kalau satu jurnal punya lebih dari satu nota, diambil yang paling awal
-- (nota utamanya); sisanya tetap bisa dilihat di Arsip Nota.
-- ============================================================================

UPDATE journal_entries je
SET proof_url = mn.drive_url
FROM (
  SELECT DISTINCT ON (entry_ref_id) entry_ref_id, drive_url
  FROM manual_notas
  WHERE entry_ref_id IS NOT NULL AND drive_url <> ''
  ORDER BY entry_ref_id, created_at
) mn
WHERE je.ref_id = mn.entry_ref_id
  AND je.proof_url IS NULL;
