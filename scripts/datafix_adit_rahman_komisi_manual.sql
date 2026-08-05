-- ============================================================================
-- datafix_adit_rahman_komisi_manual.sql (2026-08-06)
--
-- MASALAH
--   Komisi relasi Adit Rahman Rp50.000 untuk event "Yokke — Kick Off Srikandi
--   Yokke" (PRJ-20260722-3958) SUDAH dibayar dari BCA, tapi lewat jurnal manual
--   sebelum modul Komisi ada:
--
--     JE-20260722-002      (settlement) Dr 5-301 50.000 / Cr 2-102 50.000
--     JE-20260723-E49B017C (manual)     Dr 5-301 50.000 / Cr 1-110 50.000
--
--   Akibatnya:
--     • Beban komisi 5-301 tercatat DUA KALI (Rp100.000 untuk komisi Rp50.000)
--     • Utang komisi 2-102 masih Rp50.000 — tidak pernah lunas, muncul terus
--       sebagai "Terutang" di hub Komisi
--     • Kas BCA sudah benar berkurang Rp50.000 (uangnya memang keluar)
--
-- PERBAIKAN — satu jurnal koreksi reklasifikasi:
--     Dr 2-102 50.000 / Cr 5-301 50.000
--   Utang lunas + beban dobel hilang, KAS TIDAK DISENTUH (uangnya sudah benar).
--   Jurnal manual aslinya sengaja TIDAK dihapus/dibalik — jejak auditnya utuh,
--   koreksinya berdiri sendiri sebagai baris tersendiri (praktik akuntansi
--   normal untuk "salah akun").
--
--   Tanggal koreksi = 2026-07-23 (tanggal bayar sebenarnya), BUKAN hari ini,
--   supaya Buku Bulanan Juli ikut benar: biaya Juli turun Rp50.000 & untung
--   Juli naik Rp50.000 — memang dobel-catat itu yang dihapus.
--
--   Lalu dicatat di commission_payouts supaya hub Komisi menampilkannya
--   "Dibayar · 23 Jul 2026 · BCA", persis seperti kalau dulu dibayar lewat
--   modul ini.
--
-- AMAN DIULANG: seluruhnya di dalam satu DO block dengan guard — kalau sudah
-- pernah jalan (payout aktif sudah ada), tidak melakukan apa-apa.
-- ============================================================================

DO $fix$
DECLARE
  v_event_id     UUID := 'e0ea4b69-ffb5-4b57-bebb-5195ed85e124';  -- Yokke — Kick Off Srikandi Yokke
  v_manual_je    UUID := '9e669f98-4eab-464c-971b-a4530bf9396c';  -- JE-20260723-E49B017C
  v_bank_acct    UUID := '491a488c-7c29-4492-a36b-00ca979802f5';  -- Bank BCA (1-110)
  v_payee        UUID := '377c2a4c-0a59-4a65-9977-4c67ef88e0e5';  -- Adit Rahman
  v_actor        UUID := '4c23fa8c-a7b1-47c9-96de-92b9b3063ced';  -- pembuat jurnal manual
  v_pay_date     DATE := '2026-07-23';
  v_amount       BIGINT := 50000;
  v_entry_id     UUID;
  v_ref          TEXT;
  v_payout_id    UUID;
  v_saldo_2102   BIGINT;
  v_beban_5301   BIGINT;
  v_d            BIGINT;
  v_c            BIGINT;
BEGIN
  -- Guard 1: sudah pernah dijalankan?
  IF EXISTS (
    SELECT 1 FROM commission_payouts
    WHERE event_id = v_event_id AND kind = 'relasi' AND is_reversed = false
  ) THEN
    RAISE NOTICE 'SKIP: komisi event ini sudah tercatat dibayar.';
    RETURN;
  END IF;

  -- Guard 2: pastikan kondisi awal memang seperti yang didiagnosis.
  SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0) INTO v_saldo_2102
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
  WHERE jl.account_code = '2-102' AND je.source_event_id = v_event_id;
  IF v_saldo_2102 <> v_amount THEN
    RAISE EXCEPTION 'BATAL: utang komisi 2-102 event ini = %, bukan % — kondisi sudah berubah, jangan dikoreksi buta.',
      v_saldo_2102, v_amount;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM journal_lines
    WHERE entry_id = v_manual_je AND account_code = '5-301' AND debit_amount = v_amount
  ) THEN
    RAISE EXCEPTION 'BATAL: jurnal manual % tidak berisi Dr 5-301 % seperti yang diharapkan.',
      v_manual_je, v_amount;
  END IF;

  -- 1. Jurnal koreksi: Dr 2-102 / Cr 5-301 (kas tidak disentuh).
  v_ref := generate_journal_reference(v_pay_date);
  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description,
    source_type, source_id, source_event_id, total_amount, created_by
  ) VALUES (
    v_ref, v_pay_date, 'adjustment',
    'Koreksi: komisi relasi Adit Rahman sudah dibayar lewat jurnal manual — utang komisi dilunasi, beban dobel dihapus',
    'commission_payment', NULL, v_event_id, v_amount, v_actor
  ) RETURNING id INTO v_entry_id;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES
    (v_entry_id, '2-102', v_amount, 0,
     'Pelunasan komisi relasi Adit Rahman (utang turun) — kasnya sudah keluar di JE-20260723-E49B017C', 1),
    (v_entry_id, '5-301', 0, v_amount,
     'Hapus beban komisi yang tercatat dua kali (settlement + jurnal manual)', 2);

  -- 2. Catatan pembayaran supaya muncul "Dibayar" di hub Komisi.
  INSERT INTO commission_payouts (
    ref_id, event_id, kind, payee_name, payee_user_id, amount, admin_fee,
    payment_date, bank_account_id, notes, journal_entry_id, is_advance, created_by
  ) VALUES (
    'KOM-20260723-FIX1', v_event_id, 'relasi', 'Adit Rahman', v_payee, v_amount, 0,
    v_pay_date, v_bank_acct,
    'Dibayar sebelum modul Komisi ada — kasnya keluar lewat jurnal manual JE-20260723-E49B017C (Dr 5-301/Cr BCA). Datafix 2026-08-06 mereklas beban dobel itu jadi pelunasan utang 2-102.',
    v_entry_id, false, v_actor
  ) RETURNING id INTO v_payout_id;

  -- 3. Verifikasi hasil.
  SELECT COALESCE(SUM(jl.debit_amount), 0), COALESCE(SUM(jl.credit_amount), 0)
    INTO v_d, v_c
  FROM journal_lines jl WHERE jl.entry_id = v_entry_id;
  IF v_d <> v_c THEN
    RAISE EXCEPTION 'BATAL: jurnal koreksi tidak balance (D=% C=%)', v_d, v_c;
  END IF;

  SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0) INTO v_saldo_2102
  FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
  WHERE jl.account_code = '2-102' AND je.source_event_id = v_event_id;
  IF v_saldo_2102 <> 0 THEN
    RAISE EXCEPTION 'BATAL: utang komisi 2-102 event ini masih % setelah koreksi', v_saldo_2102;
  END IF;

  -- Beban komisi harus tersisa TEPAT satu kali. Dijumlahkan dari tiga jurnal
  -- yang menyangkut komisi ini — jurnal manualnya source_event_id NULL, jadi
  -- tidak bisa dicari lewat filter per-event.
  SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) INTO v_beban_5301
  FROM journal_lines jl
  WHERE jl.account_code = '5-301'
    AND jl.entry_id IN (
      (SELECT journal_entry_id FROM event_settlements WHERE event_id = v_event_id),
      v_manual_je,
      v_entry_id
    );
  IF v_beban_5301 <> v_amount THEN
    RAISE EXCEPTION 'BATAL: beban komisi jadi % (harusnya % — tercatat sekali saja)',
      v_beban_5301, v_amount;
  END IF;

  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES (
    'commission_payout', v_payout_id, 'datafix',
    jsonb_build_object(
      'event', 'PRJ-20260722-3958',
      'payee', 'Adit Rahman',
      'amount', v_amount,
      'correction_journal', v_ref,
      'original_manual_journal', 'JE-20260723-E49B017C',
      'reason', 'Komisi dibayar lewat jurnal manual (Dr 5-301/Cr BCA) sebelum modul Komisi ada. Direklas Dr 2-102/Cr 5-301: utang lunas, beban dobel hilang, kas tak disentuh.'
    ),
    v_actor
  );

  RAISE NOTICE 'OK: koreksi % dibuat, payout % tercatat. Utang 2-102 event = 0, beban 5-301 event = %.',
    v_ref, v_payout_id, v_beban_5301;
END
$fix$;
