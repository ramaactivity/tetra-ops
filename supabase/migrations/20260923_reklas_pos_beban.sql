-- ============================================================================
-- 20260923_reklas_pos_beban.sql — koreksi pos beban salah catat
--
-- 1. Bahan jual masuk Beban Perlengkapan (5-250)
--    Flashdisk lexar 12 pcs (Rp765.400) + Box flashdisk 30 pcs (Rp305.970),
--    dibeli 28 Jul lewat Catat transaksi → jadi beban. Stok fisiknya baru
--    masuk lewat opname "stok lebih" 27 Jul (Dr 1-202 / Cr 5-510), jadi
--    pembeliannya tercatat dua sisi di pos yang dua-duanya salah.
--    Koreksi: Dr 5-510 / Cr 5-250 — menetralkan kredit opname sekaligus
--    mengosongkan Beban Perlengkapan dari bahan jual. Stok TIDAK disentuh
--    (sudah benar jumlahnya).
--
-- 2. Perlengkapan nyangkut di Operasional Lain (5-900)
--    Lakban & kartu nama (Rp195.000) → Beban Perlengkapan.
--
-- Murni pindah pos beban: kas, persediaan, dan stok tidak berubah.
-- ============================================================================

DO $$
DECLARE v_id UUID; v_actor UUID;
BEGIN
  SELECT id INTO v_actor FROM users WHERE role IN ('super_admin','owner') AND is_active ORDER BY role LIMIT 1;

  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description, source_type, total_amount, created_by)
  VALUES ('JE-20260923-POSFIX', '2026-09-23', 'adjustment',
          'Reklas pos beban: bahan jual keluar dari Beban Perlengkapan, perlengkapan keluar dari Operasional Lain',
          'manual', 1266370, v_actor)
  RETURNING id INTO v_id;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order) VALUES
    (v_id, '5-510', 1071370, 0, 'Bahan jual (flashdisk + box 28 Jul) — netralkan kredit stok lebih opname', 1),
    (v_id, '5-250', 0, 1071370, 'Keluarkan bahan jual dari Beban Perlengkapan', 2),
    (v_id, '5-250', 195000, 0, 'Lakban & kartu nama masuk Beban Perlengkapan', 3),
    (v_id, '5-900', 0, 195000, 'Keluarkan perlengkapan dari Beban Operasional Lain', 4);
END $$;
