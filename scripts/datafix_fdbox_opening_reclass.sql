-- datafix_fdbox_opening_reclass.sql
-- ============================================================================
-- Reklas koreksi saldo awal Box Custom Flashdisk: Beban Wastage → Modal Awal.
-- ============================================================================
-- Konteks: 25 Juni 2026 owner Adjust Stok FD-BOX 2 → 12 pcs (reason 'opname').
-- Itu KOREKSI saldo awal (10 box memang sudah ada, salah ketik saat cutoff),
-- BUKAN wastage. Jurnal adjust membukukan Cr 5-510 (Beban Wastage) Rp 100.000
-- → muncul "untung wastage" semu di laba-rugi Juni. Reklas ke 3-101 (Modal
-- Awal), tempat koreksi saldo awal seharusnya berada. Persediaan (1-202) tetap
-- benar, tidak disentuh. Saldo seimbang.
--
-- Idempotent: guard ON CONFLICT lewat ref_id unik + cek belum ada.
DO $$
DECLARE
  v_actor uuid;
  v_je_id uuid;
  v_ref   text := 'JE-RECLAS-FDBOX-OPEN';
BEGIN
  -- Idempotent: skip kalau sudah pernah dijalankan
  IF EXISTS (SELECT 1 FROM journal_entries WHERE ref_id = v_ref) THEN
    RAISE NOTICE 'Reklas FD-BOX sudah ada (%) — skip.', v_ref;
    RETURN;
  END IF;

  SELECT id INTO v_actor FROM users
   WHERE role IN ('owner','super_admin') ORDER BY created_at LIMIT 1;

  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description,
    source_type, source_id, total_amount, created_by, created_at
  ) VALUES (
    v_ref, DATE '2026-06-25', 'adjustment'::journal_entry_type,
    'Reklas koreksi saldo awal FD-BOX: Beban Wastage → Modal Awal',
    'manual', NULL, 100000, v_actor, now()
  ) RETURNING id INTO v_je_id;

  -- Dr 5-510 Beban Wastage 100.000  (balikkan "untung wastage" semu → 0)
  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES (v_je_id, '5-510', 100000, 0, 'Reklas koreksi saldo awal (bukan wastage)', 1);

  -- Cr 3-101 Modal Awal 100.000  (koreksi saldo awal masuk ke ekuitas)
  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES (v_je_id, '3-101', 0, 100000, 'Koreksi saldo awal persediaan FD-BOX', 2);

  RAISE NOTICE 'Reklas FD-BOX dibuat: %', v_je_id;
END $$;
