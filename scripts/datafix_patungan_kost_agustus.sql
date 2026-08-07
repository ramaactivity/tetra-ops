-- ============================================================================
-- datafix_patungan_kost_agustus.sql (2026-08-07)
--
-- Kost Agustus Rp800.000 sudah dibayar 6 Agu (JE-20260806-ACBD1EF3, Dr 5-260 /
-- Cr BCA) tapi patungannya belum dicatat. Kesepakatan: Rp100.000 per owner,
-- dipotong dari bagi hasil — jadi beban Tetra yang sebenarnya Rp400.000.
--
--     Dr 2-300 Hutang Bagi Hasil Owner  Rp400.000
--         Cr 5-260 Beban Sewa Tempat & Kost  Rp400.000
--
-- Kas tidak bergerak: owner "membayar" dengan merelakan sebagian jatahnya.
-- Bentuk jurnal & sub-ledger PERSIS sama dengan yang dihasilkan tombol
-- "Potong patungan" (src/lib/finance/owner-patungan.ts), supaya baris ini tidak
-- bisa dibedakan dari yang dicatat lewat UI.
--
-- Aman diulang: guard di awal menolak kalau patungan kost Agustus sudah ada.
-- ============================================================================

DO $fix$
DECLARE
  v_actor    UUID := '4c23fa8c-a7b1-47c9-96de-92b9b3063ced';
  v_per      BIGINT := 100000;
  v_date     DATE := DATE '2026-08-06';
  v_desc     TEXT := 'Patungan sewa tempat & kost Agustus 2026';
  v_entry    UUID;
  v_ref      TEXT;
  v_owners   INT;
  v_total    BIGINT;
  v_pool     BIGINT;
  v_sub      BIGINT;
  v_kost     BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM owner_earnings
    WHERE earning_type = 'contribution' AND period_month = DATE '2026-08-01'
  ) THEN
    RAISE NOTICE 'SKIP: patungan Agustus sudah tercatat.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_owners FROM users WHERE role = 'owner' AND is_active = true;
  IF v_owners = 0 THEN RAISE EXCEPTION 'BATAL: tidak ada owner aktif.'; END IF;
  v_total := v_per * v_owners;

  v_ref := generate_journal_reference(v_date);
  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
    source_type, total_amount, created_by)
  VALUES (v_ref, v_date, 'adjustment', v_desc, 'owner_patungan', v_total, v_actor)
  RETURNING id INTO v_entry;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES
    (v_entry, '2-300', v_total, 0,
     'Patungan ' || v_owners || ' owner @' || v_per || ' — dipotong dari bagi hasil', 1),
    (v_entry, '5-260', 0, v_total, 'Beban ditanggung patungan owner', 2);

  INSERT INTO owner_earnings (owner_user_id, earning_type, amount, period_month,
    description, performed_by)
  SELECT id, 'contribution', -v_per, DATE '2026-08-01', v_desc, v_actor
  FROM users WHERE role = 'owner' AND is_active = true;

  -- Verifikasi: GL bagi hasil == sub-ledger, dan beban kost bersih benar.
  SELECT COALESCE(SUM(credit_amount - debit_amount), 0) INTO v_pool
  FROM journal_lines WHERE account_code = '2-300';
  SELECT COALESCE(SUM(amount), 0) INTO v_sub FROM owner_earnings;
  IF v_pool <> v_sub THEN
    RAISE EXCEPTION 'BATAL: 2-300 % <> sub-ledger %', v_pool, v_sub;
  END IF;

  SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_kost
  FROM journal_lines WHERE account_code = '5-260';
  IF v_kost <> 800000 THEN
    RAISE EXCEPTION 'BATAL: beban kost bersih % (harusnya 800.000 = Juli 400rb + Agustus 400rb)', v_kost;
  END IF;

  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES ('journal_entry', v_entry, 'datafix',
    jsonb_build_object('ref', v_ref, 'per_owner', v_per, 'owners', v_owners,
      'reason', 'Patungan kost Agustus dipotong dari bagi hasil; kost dibayar penuh 6 Agu sebelum fitur patungan ada.'),
    v_actor);

  RAISE NOTICE 'OK: % — % owner @% = %. Bagi hasil sisa %, beban kost bersih %.',
    v_ref, v_owners, v_per, v_total, v_pool, v_kost;
END
$fix$;
