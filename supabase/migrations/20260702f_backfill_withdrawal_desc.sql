-- 20260702f_backfill_withdrawal_desc.sql
-- ============================================================================
-- Backfill deskripsi entry withdrawal owner yang sudah ter-posting supaya
-- menyebut nama owner (yg lama: "Withdrawal owner pool — Bagi hasil Juni 2026",
-- identik utk semua owner). Hanya teks; angka/akun/ref tidak berubah.
-- ============================================================================

-- 1. Deskripsi jurnal: "Withdrawal owner pool — X" → "X — <Nama Owner>"
UPDATE journal_entries je
SET description = regexp_replace(je.description, '^Withdrawal owner pool — ', '')
                 || ' — ' || u.full_name
FROM users u
WHERE je.source_type = 'owner_withdrawal'
  AND je.source_id = u.id
  AND je.description LIKE 'Withdrawal owner pool — %';

-- 2. Baris 2-300 (Hutang Bagi Hasil Owner): sebut nama owner juga
UPDATE journal_lines jl
SET description = 'Bagi hasil ' || u.full_name || ' dibayar'
FROM journal_entries je
JOIN users u ON u.id = je.source_id
WHERE jl.entry_id = je.id
  AND je.source_type = 'owner_withdrawal'
  AND jl.account_code = '2-300'
  AND jl.description = 'Bagi hasil owner dibayar';
