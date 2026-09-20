-- ============================================================================
-- 20260920b_reclass_sewa_mobil_vps.sql
--
-- Dua salah-pilih kategori yang ketahuan waktu audit:
--
-- 1. Sewa mobil Rp500.000 masuk 5-210 Beban Transport BBM, padahal akun
--    5-212 Beban Sewa Mobil sudah ada:
--      2026-07-23 Rp250.000 "Pembayaran sewa mobil operational/event"
--      2026-08-12 Rp250.000 "Sewa Mobil Singgih"
--    Akibatnya ongkos bensin terlihat 2× lipat dari yang sebenarnya.
--
-- 2. Langganan VPS Rp161.860 (2026-09-11) masuk 5-410 Beban Marketing,
--    padahal itu biaya infrastruktur — rumahnya 5-400 Beban Platform/Aplikasi.
--
-- Kas tidak tersentuh; ini murni pindah pos beban.
-- ============================================================================

DO $$
DECLARE
  v_entry UUID;
  v_actor UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM journal_entries WHERE ref_id = 'JE-20260920-POSFIX') THEN
    RAISE NOTICE 'Reklas sudah pernah diterapkan — dilewati.';
    RETURN;
  END IF;

  SELECT created_by INTO v_actor FROM journal_entries
  WHERE description = 'Sewa Mobil Singgih' LIMIT 1;

  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
                               source_type, total_amount, created_by)
  VALUES ('JE-20260920-POSFIX', '2026-09-20', 'adjustment',
          'Reklas pos beban: sewa mobil keluar dari Transport BBM, VPS keluar dari Marketing',
          'manual', 661860, v_actor)
  RETURNING id INTO v_entry;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES
    (v_entry, '5-212', 500000, 0, 'Sewa mobil 23 Jul + 12 Agu (pindah dari Transport BBM)', 1),
    (v_entry, '5-210', 0, 500000, 'Keluarkan sewa mobil dari Beban Transport BBM', 2),
    (v_entry, '5-400', 161860, 0, 'Langganan VPS 11 Sep (pindah dari Marketing)', 3),
    (v_entry, '5-410', 0, 161860, 'Keluarkan langganan VPS dari Beban Marketing', 4);
END $$;
