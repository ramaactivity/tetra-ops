-- ============================================================================
-- 20260923c_reklas_operasional_lain_habis.sql — kosongkan Beban Operasional Lain
--
-- Sisa Rp55.000 di 5-900 semuanya item "Lain-lain" dari rekap event yang
-- keterangannya kosong atau asal ("P", "1", ""):
--   10.000  25 Agu  BRI — Culture Fest 2026        (note "P")
--   15.000   7 Sep  Captain Barbershop Outing 2026 (note kosong)
--   15.000   7 Sep  Sulis & Fadly                  (note "1")
--   15.000  13 Sep  Bowo & Putri                   (note kosong)
--
-- Keempat rekapnya punya transport/toll terisi tapi parking_cost = Rp0,
-- nominalnya seragam Rp10-15rb, dan yang keterangannya terbaca berbunyi "P".
-- Jadi ini parkir yang tercatat lewat kolom "Lain-lain" — dipindahkan ke
-- Beban Parkir (5-214) supaya 5-900 benar-benar kosong.
--
-- Murni pindah pos beban: kas dan stok tidak berubah.
-- ============================================================================

DO $$
DECLARE v_id UUID; v_actor UUID;
BEGIN
  SELECT id INTO v_actor FROM users WHERE role IN ('super_admin','owner') AND is_active ORDER BY role LIMIT 1;

  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description, source_type, total_amount, created_by)
  VALUES ('JE-20260923-POSFIX3', '2026-09-23', 'adjustment',
          'Reklas pos beban: parkir event keluar dari Operasional Lain',
          'manual', 55000, v_actor)
  RETURNING id INTO v_id;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order) VALUES
    (v_id, '5-214', 55000, 0, 'Parkir 4 event (25 Agu, 7 Sep ×2, 13 Sep) — pindah dari Operasional Lain', 1),
    (v_id, '5-900', 0, 55000, 'Kosongkan Beban Operasional Lain', 2);
END $$;
