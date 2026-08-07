-- ============================================================================
-- datafix_patungan_kost_juli.sql (2026-08-07)
--
-- Owner mengonfirmasi: 2 Juli tiap owner ditransfer Rp400.000, BUKAN Rp500.000.
-- Yang Rp100.000 langsung dipotong untuk patungan kost. Jadi tidak pernah ada
-- uang Rp400.000 masuk kembali ke BCA.
--
-- YANG TERCATAT SEKARANG (fitur patungan belum ada saat itu, jadi dipakai
-- kategori "Patungan owner" yang artinya transfer tunai masuk):
--   JE-20260702-001..004  Dr 2-300 500.000 / Cr 1-110 500.000   (×4 owner)
--   JE-20260702-49134EF1  Dr 1-110 400.000 / Cr 5-260 400.000   ❌ uang masuk palsu
--
-- YANG SEHARUSNYA:
--   JE-20260702-001..004  Dr 2-300 400.000 / Cr 1-110 400.000   (×4 owner)
--   JE-20260702-49134EF1  Dr 2-300 400.000 / Cr 5-260 400.000   (potong bagi hasil)
--
-- CATATAN PENTING — ini perbaikan PENYAJIAN, bukan angka:
--   BCA  : −2.000.000 + 400.000 = −1.600.000  →  4 × −400.000 = −1.600.000  SAMA
--   2-300: −2.000.000            →  −1.600.000 − 400.000       = −2.000.000  SAMA
--   5-260: −400.000              →  −400.000                                 SAMA
--   owner_earnings/owner: −500.000 → −400.000 − 100.000 = −500.000           SAMA
-- Karena setiap saldo tidak berubah, jurnal koreksi akan bernilai NOL dan
-- percuma — satu-satunya cara membuat buku cocok dengan mutasi bank adalah
-- menyunting baris yang ada. Nilai lama disimpan di audit_log agar bisa
-- dikembalikan kalau ternyata ingatannya keliru.
--
-- Setelah ini, daftar transaksi di buku cocok dengan mutasi BCA: 4 transfer
-- keluar @Rp400.000, tanpa uang masuk Rp400.000.
--
-- Aman diulang: guard menolak kalau potongan patungan Juli sudah ada.
-- ============================================================================

DO $fix$
DECLARE
  v_actor    UUID := '4c23fa8c-a7b1-47c9-96de-92b9b3063ced';
  v_patungan UUID;
  v_desc     TEXT := 'Patungan sewa tempat & kost Juli 2026';
  v_rows     INT;
  v_pool     BIGINT;
  v_sub      BIGINT;
  v_bca      BIGINT;
  v_kost     BIGINT;
  v_d        BIGINT;
  v_c        BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM owner_earnings
    WHERE earning_type = 'contribution' AND period_month = DATE '2026-07-01'
  ) THEN
    RAISE NOTICE 'SKIP: patungan Juli sudah tercatat.';
    RETURN;
  END IF;

  SELECT id INTO v_patungan FROM journal_entries WHERE ref_id = 'JE-20260702-49134EF1';
  IF v_patungan IS NULL THEN
    RAISE EXCEPTION 'BATAL: jurnal patungan Juli tidak ditemukan.';
  END IF;

  -- Guard: pastikan kondisi awal persis seperti yang didiagnosis.
  SELECT COUNT(*) INTO v_rows FROM journal_entries
  WHERE ref_id IN ('JE-20260702-001','JE-20260702-002','JE-20260702-003','JE-20260702-004')
    AND total_amount = 500000 AND source_type = 'owner_withdrawal';
  IF v_rows <> 4 THEN
    RAISE EXCEPTION 'BATAL: harusnya ada 4 withdrawal Rp500.000, ketemu %.', v_rows;
  END IF;

  -- Simpan keadaan lama untuk jejak & kemungkinan pengembalian.
  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES ('journal_entry', v_patungan, 'datafix',
    jsonb_build_object(
      'sebelum', jsonb_build_object(
        'withdrawal_per_owner', 500000,
        'patungan_jurnal', 'Dr 1-110 400.000 / Cr 5-260 400.000 (uang masuk)'),
      'sesudah', jsonb_build_object(
        'withdrawal_per_owner', 400000,
        'patungan_jurnal', 'Dr 2-300 400.000 / Cr 5-260 400.000 (potong bagi hasil)'),
      'reason', 'Owner konfirmasi: transfer ke tiap owner Rp400.000, Rp100.000 dipotong untuk patungan kost. Tidak ada uang masuk Rp400.000 ke BCA. Saldo tidak berubah; ini perbaikan penyajian agar cocok dengan mutasi bank.'),
    v_actor);

  -- 1. Withdrawal 500.000 → 400.000 (jurnal + total + sub-ledger).
  UPDATE journal_lines jl SET
    debit_amount  = CASE WHEN jl.debit_amount  = 500000 THEN 400000 ELSE jl.debit_amount  END,
    credit_amount = CASE WHEN jl.credit_amount = 500000 THEN 400000 ELSE jl.credit_amount END
  FROM journal_entries je
  WHERE je.id = jl.entry_id
    AND je.ref_id IN ('JE-20260702-001','JE-20260702-002','JE-20260702-003','JE-20260702-004');

  UPDATE journal_entries SET total_amount = 400000
  WHERE ref_id IN ('JE-20260702-001','JE-20260702-002','JE-20260702-003','JE-20260702-004');

  UPDATE owner_earnings SET amount = -400000
  WHERE earning_type = 'withdrawal' AND amount = -500000
    AND date_trunc('month', created_at)::date = DATE '2026-07-01';

  -- 2. Patungan: sisi debit pindah dari BCA ke Hutang Bagi Hasil.
  UPDATE journal_lines
  SET account_code = '2-300',
      description = 'Patungan 4 owner @100.000 — dipotong dari bagi hasil'
  WHERE entry_id = v_patungan AND account_code = '1-110';

  UPDATE journal_lines
  SET description = 'Beban ditanggung patungan owner'
  WHERE entry_id = v_patungan AND account_code = '5-260';

  UPDATE journal_entries
  SET description = v_desc, entry_type = 'adjustment', source_type = 'owner_patungan'
  WHERE id = v_patungan;

  -- 3. Sub-ledger potongan patungan Juli.
  INSERT INTO owner_earnings (owner_user_id, earning_type, amount, period_month,
    description, performed_by)
  SELECT id, 'contribution', -100000, DATE '2026-07-01', v_desc, v_actor
  FROM users WHERE role = 'owner' AND is_active = true;

  -- ── Verifikasi: semua saldo harus TETAP ────────────────────────────────
  SELECT COALESCE(SUM(credit_amount - debit_amount), 0) INTO v_pool
  FROM journal_lines WHERE account_code = '2-300';
  SELECT COALESCE(SUM(amount), 0) INTO v_sub FROM owner_earnings;
  IF v_pool <> v_sub THEN
    RAISE EXCEPTION 'BATAL: 2-300 % <> sub-ledger %', v_pool, v_sub;
  END IF;
  IF v_pool <> 200000 THEN
    RAISE EXCEPTION 'BATAL: bagi hasil % (harusnya tetap 200.000)', v_pool;
  END IF;

  SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_kost
  FROM journal_lines WHERE account_code = '5-260';
  IF v_kost <> 800000 THEN
    RAISE EXCEPTION 'BATAL: beban kost % (harusnya tetap 800.000)', v_kost;
  END IF;

  SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) INTO v_bca
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
  WHERE jl.account_code = '1-110' AND je.entry_date = DATE '2026-07-02';
  IF v_bca <> -2562100 THEN
    RAISE EXCEPTION 'BATAL: arus BCA 2 Juli % (harusnya tetap -2.562.100)', v_bca;
  END IF;

  SELECT COALESCE(SUM(debit_amount),0), COALESCE(SUM(credit_amount),0) INTO v_d, v_c
  FROM journal_lines;
  IF v_d <> v_c THEN
    RAISE EXCEPTION 'BATAL: buku tidak seimbang (D=% C=%)', v_d, v_c;
  END IF;

  RAISE NOTICE 'OK: withdrawal Juli jadi 4 × 400.000, patungan 400.000 potong bagi hasil. Semua saldo tetap: 2-300=%, kost=%, arus BCA 2 Jul=%.',
    v_pool, v_kost, v_bca;
END
$fix$;
