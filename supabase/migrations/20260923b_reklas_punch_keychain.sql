-- ============================================================================
-- 20260923b_reklas_punch_keychain.sql — lanjutan koreksi pos beban
--
-- 1. Punch Hole Keychain Rp518.866 (24 Jun) — ALAT pemotong foto supaya muat
--    di keychain, bukan biaya operasional serabutan. Operasional Lain (5-900)
--    → Beban Perlengkapan & Peralatan Kecil (5-250). Di bawah batas
--    kapitalisasi Rp1,5jt, jadi tetap dibebankan, bukan aset tetap.
--
-- 2. Keychain Rp103.500 (37.000 10 Jul + 19.000 28 Jul + 47.500 12 Agu) —
--    bahan jual, bukan perlengkapan pakai-sendiri. Stoknya tidak pernah masuk
--    (tidak ada pembelian maupun opname untuk ketiganya), jadi TIDAK
--    dikembalikan ke persediaan: itu akan memunculkan stok yang barangnya tak
--    ada. Dipindah ke HPP Keychain (5-105) — pos yang benar untuk bahan jual
--    yang langsung terpakai.
--    Konsekuensi yang disengaja: total 5-105 jadi lebih besar dari jumlah HPP
--    keychain di settlement, karena tiga pembelian ini memang tak pernah lewat
--    stok. Selisihnya = Rp103.500, bukan drift baru.
--
-- Murni pindah pos beban: kas, persediaan, dan stok tidak berubah.
-- ============================================================================

DO $$
DECLARE v_id UUID; v_actor UUID;
BEGIN
  SELECT id INTO v_actor FROM users WHERE role IN ('super_admin','owner') AND is_active ORDER BY role LIMIT 1;

  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description, source_type, total_amount, created_by)
  VALUES ('JE-20260923-POSFIX2', '2026-09-23', 'adjustment',
          'Reklas pos beban: alat punch hole ke Perlengkapan, bahan keychain ke HPP Keychain',
          'manual', 622366, v_actor)
  RETURNING id INTO v_id;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order) VALUES
    (v_id, '5-250', 518866, 0, 'Alat punch hole keychain (24 Jun) — pindah dari Operasional Lain', 1),
    (v_id, '5-900', 0, 518866, 'Keluarkan alat punch hole dari Beban Operasional Lain', 2),
    (v_id, '5-105', 103500, 0, 'Bahan keychain 10 Jul + 28 Jul + 12 Agu — pindah dari Perlengkapan', 3),
    (v_id, '5-250', 0, 103500, 'Keluarkan bahan jual keychain dari Beban Perlengkapan', 4);
END $$;
