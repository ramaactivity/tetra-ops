-- ============================================================================
-- datafix_komisi_manual_juli_agustus.sql (2026-08-06)
--
-- Dua komisi dibayar lewat jurnal manual sebelum modul Komisi dipakai, plus
-- satu nama crew yang belum diganti. Dibetulkan sekaligus dalam satu transaksi.
--
-- ── A. Komisi relasi Adit Rahman — "Yokke — Kick Off Srikandi Yokke" ───────
--    Komisi disepakati naik Rp50.000 → Rp100.000 SETELAH event di-rekap, jadi
--    tidak bisa diubah lewat UI dan tidak pernah masuk sistem (audit event:
--    referrer_commission diisi 50.000 saat dibuat 8 Jul, tak pernah berubah).
--    Adit sudah menerima Rp100.000.
--
--    Di buku: settlement mengakru 50.000 (Cr 2-102), lalu JE-20260723-E49B017C
--    "Penyesuaian kekurangan beban komisi" mendebit 5-301 50.000 tapi lawannya
--    keliru ke BCA — beban jadi benar 100.000, tapi utangnya tidak pernah naik
--    dan pembayaran 100.000 tak pernah tercatat utuh.
--
-- ── B. Komisi sales Ramadan Saputra — "20th Anniversary PT. Gratama" ───────
--    Event channel direct, tapi sales_user_id kosong & komisi 0 → settlement
--    tidak mengakru apa pun. Ramadan sudah menerima Rp100.000, dicatat sebagai
--    JE-20260802-F1B81CDB "Pengeluaran" (Dr 5-301 / Cr BCA) — beban langsung
--    tanpa utang, dan komisinya tak terlihat di modul Komisi.
--
-- ── C. Nama crew di event PT. Gratama ─────────────────────────────────────
--    Posisi asisten tercatat atas nama Fahmi Kurniawan, padahal yang bertugas
--    & menerima transfer adalah Rangga Ramadhan. Nominal & pembayarannya benar
--    (Rp300.000 + biaya admin bank Rp2.500) — yang salah cuma namanya.
--
-- POLA: balik-dan-tulis-ulang. Jurnal lama tidak disunting/dihapus, tapi
-- dibalik lalu diganti jurnal yang benar (akrual + pelunasan), supaya di
-- Akuntansi kelihatan mana yang dikoreksi dan kenapa.
--
-- IKUTAN: komisi bertambah → laba event turun → jatah dana cadangan (5% alat,
-- 3% perawatan, 2% darurat) ikut turun. Semua disesuaikan, termasuk saldo GL
-- dana cadangannya, supaya subledger & buku besar tetap cocok.
--
-- AMAN DIULANG: satu DO block + guard di awal tiap bagian.
-- ============================================================================

DO $fix$
DECLARE
  -- Pelaku & rekening
  v_actor      UUID := '4c23fa8c-a7b1-47c9-96de-92b9b3063ced';
  v_bca        UUID := '491a488c-7c29-4492-a36b-00ca979802f5';  -- bank_accounts BCA (1-110)

  -- A. Yokke / Adit Rahman
  v_ev_yokke   UUID := 'e0ea4b69-ffb5-4b57-bebb-5195ed85e124';
  v_je_jul     UUID := '9e669f98-4eab-464c-971b-a4530bf9396c';  -- JE-20260723-E49B017C
  v_adit       UUID := '377c2a4c-0a59-4a65-9977-4c67ef88e0e5';

  -- B. PT Gratama / Ramadan Saputra
  v_ev_grat    UUID := '1aefd605-c38e-490b-8f0f-b8af135d94b6';
  v_je_agu     UUID := '2c605a83-4eb1-4c08-9646-e99a647255de';  -- JE-20260802-F1B81CDB
  v_ramadan    UUID := '19b5b17b-2da4-48b5-9c83-2343010c9f74';

  -- C. Nama crew
  v_assign     UUID := '8f830f4c-b4ad-40ff-9ea6-9284a61bdcdb';
  v_rangga     UUID := '2e8905b3-82ce-4cc7-b0bb-dff7ffeb5511';
  v_fahmi      UUID := 'a624b59c-a0b4-402b-b004-6f1f3ec3d21f';
  v_je_crew    UUID;

  v_st         RECORD;
  v_rev        UUID;
  v_accrual    UUID;
  v_payment    UUID;
  v_adj        UUID;
  v_ref        TEXT;
  v_payout_a   UUID;
  v_payout_b   UUID;

  v_profit     BIGINT;
  v_eq BIGINT; v_mt BIGINT; v_em BIGINT; v_sink BIGINT; v_delta BIGINT;

  v_chk BIGINT; v_d BIGINT; v_c BIGINT;
BEGIN
  -- ══════════════════════════════════════════════════════════════════════════
  -- GUARD umum
  -- ══════════════════════════════════════════════════════════════════════════
  IF EXISTS (SELECT 1 FROM commission_payouts
             WHERE event_id IN (v_ev_yokke, v_ev_grat) AND is_reversed = false) THEN
    RAISE NOTICE 'SKIP: komisi salah satu event ini sudah tercatat dibayar.';
    RETURN;
  END IF;
  IF (SELECT is_reversed FROM journal_entries WHERE id = v_je_jul)
     OR (SELECT is_reversed FROM journal_entries WHERE id = v_je_agu) THEN
    RAISE EXCEPTION 'BATAL: jurnal manual sudah pernah dibalik.';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. KOMISI ADIT RAHMAN — Yokke
  -- ══════════════════════════════════════════════════════════════════════════
  SELECT * INTO v_st FROM event_settlements WHERE event_id = v_ev_yokke;
  IF v_st.is_reopened THEN RAISE EXCEPTION 'BATAL: settlement Yokke ter-reopen.'; END IF;
  IF v_st.komisi_relasi <> 50000 THEN
    RAISE EXCEPTION 'BATAL: komisi relasi Yokke di settlement = %, bukan 50.000', v_st.komisi_relasi;
  END IF;

  -- A1. Balik jurnal 23 Jul yang keliru mengurangi BCA.
  v_ref := generate_journal_reference('2026-07-23'::DATE);
  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
    source_type, source_event_id, total_amount, created_by)
  VALUES (v_ref, '2026-07-23', 'reversal',
    'Pembatalan: penyesuaian beban komisi keliru dicatat sebagai uang keluar, bukan utang komisi',
    'manual', v_ev_yokke, 50000, v_actor)
  RETURNING id INTO v_rev;
  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  SELECT v_rev, jl.account_code, jl.credit_amount, jl.debit_amount,
         'Pembalik — penyesuaian beban komisi 23 Jul', jl.line_order
  FROM journal_lines jl WHERE jl.entry_id = v_je_jul;
  UPDATE journal_entries SET is_reversed = true, reversed_by_entry_id = v_rev, reversed_at = NOW()
  WHERE id = v_je_jul;

  -- A2. Akrual tambahan komisi (50rb → 100rb).
  v_ref := generate_journal_reference('2026-07-23'::DATE);
  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
    source_type, source_event_id, total_amount, created_by)
  VALUES (v_ref, '2026-07-23', 'expense',
    'Tambahan komisi relasi Adit Rahman — naik Rp50.000 jadi Rp100.000 setelah rekap',
    'manual', v_ev_yokke, 50000, v_actor)
  RETURNING id INTO v_accrual;
  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES (v_accrual, '5-301', 50000, 0, 'Kekurangan beban komisi relasi', 1),
         (v_accrual, '2-102', 0, 50000, 'Utang komisi relasi bertambah', 2);

  -- A3. Pembayaran penuh Rp100.000 ke Adit.
  v_ref := generate_journal_reference('2026-07-23'::DATE);
  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
    source_type, source_event_id, total_amount, created_by)
  VALUES (v_ref, '2026-07-23', 'asset_out',
    'Bayar komisi relasi — Adit Rahman', 'commission_payment', v_ev_yokke, 100000, v_actor)
  RETURNING id INTO v_payment;
  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES (v_payment, '2-102', 100000, 0, 'Pelunasan komisi relasi (utang turun)', 1),
         (v_payment, '1-110', 0, 100000, 'Pembayaran kas/bank', 2);

  -- A4. Hulu + settlement + dana cadangan.
  UPDATE events SET referrer_commission = 100000, updated_at = NOW() WHERE id = v_ev_yokke;

  v_profit := v_st.revenue_net - (v_st.total_biaya + 50000);
  v_eq := FLOOR(v_profit * 0.05); v_mt := FLOOR(v_profit * 0.03); v_em := FLOOR(v_profit * 0.02);
  v_sink := v_eq + v_mt + v_em + v_st.sinking_crew_reserve;
  v_delta := v_st.sinking_total - v_sink;

  UPDATE event_settlements SET
    komisi_relasi = 100000,
    opex_total = v_st.opex_total + 50000,
    total_biaya = v_st.total_biaya + 50000,
    net_profit = v_profit,
    margin_percentage = ROUND((v_profit::NUMERIC / NULLIF(v_st.revenue_net,0)) * 100, 2),
    is_loss = (v_profit < 0),
    sinking_equipment = v_eq, sinking_maintenance = v_mt, sinking_emergency = v_em,
    sinking_total = v_sink,
    operating_cash_kept = v_profit - v_sink - v_st.owner_pool_total
  WHERE id = v_st.id;

  UPDATE sinking_fund_movements sfm SET amount = CASE sf.code
      WHEN 'equipment' THEN v_eq WHEN 'maintenance' THEN v_mt WHEN 'emergency' THEN v_em
      ELSE sfm.amount END
  FROM sinking_funds sf
  WHERE sf.id = sfm.fund_id AND sfm.source_settlement_id = v_st.id
    AND sfm.movement_type = 'deposit' AND sf.code IN ('equipment','maintenance','emergency');

  IF v_delta <> 0 THEN
    v_ref := generate_journal_reference(v_st.closed_at::DATE);
    INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
      source_type, source_id, source_event_id, total_amount, created_by)
    VALUES (v_ref, v_st.closed_at::DATE, 'adjustment',
      'Koreksi dana cadangan — laba event turun setelah komisi relasi dibetulkan',
      'settlement', v_st.id, v_ev_yokke, v_delta, v_actor)
    RETURNING id INTO v_adj;
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    VALUES (v_adj, '2-200', v_st.sinking_equipment - v_eq, 0, 'Koreksi dana cadangan: Alat', 1),
           (v_adj, '2-201', v_st.sinking_maintenance - v_mt, 0, 'Koreksi dana cadangan: Perawatan', 2),
           (v_adj, '2-203', v_st.sinking_emergency - v_em, 0, 'Koreksi dana cadangan: Darurat', 3),
           (v_adj, '3-200', 0, v_delta, 'Sisihan laba yang kelebihan dikembalikan', 4);
  END IF;

  INSERT INTO commission_payouts (ref_id, event_id, kind, payee_name, payee_user_id,
    amount, admin_fee, payment_date, bank_account_id, notes, journal_entry_id, is_advance, created_by)
  VALUES ('KOM-20260723-FIX', v_ev_yokke, 'relasi', 'Adit Rahman', v_adit,
    100000, 0, '2026-07-23', v_bca,
    'Dibayar sebelum modul Komisi dipakai. Datafix 2026-08-06: komisi dinaikkan Rp50.000 → Rp100.000 (kesepakatan setelah rekap, tak bisa diedit dari UI); jurnal manual 23 Jul dibalik lalu ditulis ulang jadi akrual + pelunasan.',
    v_payment, false, v_actor)
  RETURNING id INTO v_payout_a;

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. KOMISI SALES RAMADAN SAPUTRA — PT. Gratama
  -- ══════════════════════════════════════════════════════════════════════════
  SELECT * INTO v_st FROM event_settlements WHERE event_id = v_ev_grat;
  IF v_st.is_reopened THEN RAISE EXCEPTION 'BATAL: settlement PT Gratama ter-reopen.'; END IF;
  IF v_st.komisi_sales_direct <> 0 THEN
    RAISE EXCEPTION 'BATAL: komisi sales PT Gratama sudah terisi (%)', v_st.komisi_sales_direct;
  END IF;

  -- B1. Balik jurnal 2 Agu (beban langsung tanpa utang).
  v_ref := generate_journal_reference('2026-08-02'::DATE);
  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
    source_type, source_event_id, total_amount, created_by)
  VALUES (v_ref, '2026-08-02', 'reversal',
    'Pembatalan: komisi sales tercatat sebagai pengeluaran umum, bukan pelunasan utang komisi',
    'manual', v_ev_grat, 100000, v_actor)
  RETURNING id INTO v_rev;
  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  SELECT v_rev, jl.account_code, jl.credit_amount, jl.debit_amount,
         'Pembalik — pengeluaran komisi 2 Agu', jl.line_order
  FROM journal_lines jl WHERE jl.entry_id = v_je_agu;
  UPDATE journal_entries SET is_reversed = true, reversed_by_entry_id = v_rev, reversed_at = NOW()
  WHERE id = v_je_agu;

  -- B2. Akrual komisi sales.
  v_ref := generate_journal_reference('2026-08-02'::DATE);
  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
    source_type, source_event_id, total_amount, created_by)
  VALUES (v_ref, '2026-08-02', 'expense',
    'Komisi sales Ramadan Saputra — 20th Anniversary PT. Gratama Finance Indonesia',
    'manual', v_ev_grat, 100000, v_actor)
  RETURNING id INTO v_accrual;
  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES (v_accrual, '5-301', 100000, 0, 'Beban komisi sales langsung', 1),
         (v_accrual, '2-102', 0, 100000, 'Utang komisi sales', 2);

  -- B3. Pembayaran komisi sales.
  v_ref := generate_journal_reference('2026-08-02'::DATE);
  INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
    source_type, source_event_id, total_amount, created_by)
  VALUES (v_ref, '2026-08-02', 'asset_out',
    'Bayar komisi sales — Ramadan Saputra', 'commission_payment', v_ev_grat, 100000, v_actor)
  RETURNING id INTO v_payment;
  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES (v_payment, '2-102', 100000, 0, 'Pelunasan komisi sales (utang turun)', 1),
         (v_payment, '1-110', 0, 100000, 'Pembayaran kas/bank', 2);

  -- B4. Hulu + settlement + dana cadangan.
  UPDATE events SET sales_user_id = v_ramadan, direct_sales_commission = 100000, updated_at = NOW()
  WHERE id = v_ev_grat;

  v_profit := v_st.revenue_net - (v_st.total_biaya + 100000);
  v_eq := FLOOR(v_profit * 0.05); v_mt := FLOOR(v_profit * 0.03); v_em := FLOOR(v_profit * 0.02);
  v_sink := v_eq + v_mt + v_em + v_st.sinking_crew_reserve;
  v_delta := v_st.sinking_total - v_sink;

  UPDATE event_settlements SET
    komisi_sales_direct = 100000,
    opex_total = v_st.opex_total + 100000,
    total_biaya = v_st.total_biaya + 100000,
    net_profit = v_profit,
    margin_percentage = ROUND((v_profit::NUMERIC / NULLIF(v_st.revenue_net,0)) * 100, 2),
    is_loss = (v_profit < 0),
    sinking_equipment = v_eq, sinking_maintenance = v_mt, sinking_emergency = v_em,
    sinking_total = v_sink,
    operating_cash_kept = v_profit - v_sink - v_st.owner_pool_total
  WHERE id = v_st.id;

  UPDATE sinking_fund_movements sfm SET amount = CASE sf.code
      WHEN 'equipment' THEN v_eq WHEN 'maintenance' THEN v_mt WHEN 'emergency' THEN v_em
      ELSE sfm.amount END
  FROM sinking_funds sf
  WHERE sf.id = sfm.fund_id AND sfm.source_settlement_id = v_st.id
    AND sfm.movement_type = 'deposit' AND sf.code IN ('equipment','maintenance','emergency');

  IF v_delta <> 0 THEN
    v_ref := generate_journal_reference(v_st.closed_at::DATE);
    INSERT INTO journal_entries (ref_id, entry_date, entry_type, description,
      source_type, source_id, source_event_id, total_amount, created_by)
    VALUES (v_ref, v_st.closed_at::DATE, 'adjustment',
      'Koreksi dana cadangan — laba event turun setelah komisi sales dicatat',
      'settlement', v_st.id, v_ev_grat, v_delta, v_actor)
    RETURNING id INTO v_adj;
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    VALUES (v_adj, '2-200', v_st.sinking_equipment - v_eq, 0, 'Koreksi dana cadangan: Alat', 1),
           (v_adj, '2-201', v_st.sinking_maintenance - v_mt, 0, 'Koreksi dana cadangan: Perawatan', 2),
           (v_adj, '2-203', v_st.sinking_emergency - v_em, 0, 'Koreksi dana cadangan: Darurat', 3),
           (v_adj, '3-200', 0, v_delta, 'Sisihan laba yang kelebihan dikembalikan', 4);
  END IF;

  INSERT INTO commission_payouts (ref_id, event_id, kind, payee_name, payee_user_id,
    amount, admin_fee, payment_date, bank_account_id, notes, journal_entry_id, is_advance, created_by)
  VALUES ('KOM-20260802-FIX', v_ev_grat, 'sales', 'Ramadan Saputra', v_ramadan,
    100000, 0, '2026-08-02', v_bca,
    'Dibayar sebelum modul Komisi dipakai (JE-20260802-F1B81CDB "Pengeluaran"). Datafix 2026-08-06: komisi sales dicatat di event + settlement, jurnal lama dibalik lalu ditulis ulang jadi akrual + pelunasan.',
    v_payment, false, v_actor)
  RETURNING id INTO v_payout_b;

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. NAMA CREW PT. GRATAMA: Fahmi Kurniawan → Rangga Ramadhan
  --    Nominal & pembayaran sudah benar (Rp300.000 + admin bank Rp2.500);
  --    yang keliru hanya orangnya.
  -- ══════════════════════════════════════════════════════════════════════════
  IF (SELECT user_id FROM crew_assignments WHERE id = v_assign) <> v_fahmi THEN
    RAISE EXCEPTION 'BATAL: penugasan % bukan atas nama Fahmi Kurniawan.', v_assign;
  END IF;
  UPDATE crew_assignments SET user_id = v_rangga, updated_at = NOW() WHERE id = v_assign;

  SELECT id INTO v_je_crew FROM journal_entries
  WHERE source_type = 'crew_payment' AND source_id = v_assign;
  IF v_je_crew IS NOT NULL THEN
    UPDATE journal_entries SET description = 'Bayar fee crew — Rangga Ramadhan' WHERE id = v_je_crew;
  END IF;
  UPDATE journal_entries
  SET description = 'Biaya admin bank — transfer fee crew Rangga Ramadhan (PT. Gratama)'
  WHERE ref_id = 'JE-20260802-7C9203E8';

  -- ══════════════════════════════════════════════════════════════════════════
  -- VERIFIKASI
  -- ══════════════════════════════════════════════════════════════════════════
  SELECT COALESCE(SUM(credit_amount - debit_amount), 0) INTO v_chk
  FROM journal_lines WHERE account_code = '2-102';
  IF v_chk <> 0 THEN RAISE EXCEPTION 'BATAL: utang komisi 2-102 = % (harusnya 0)', v_chk; END IF;

  SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_chk
  FROM journal_lines WHERE account_code = '5-301';
  IF v_chk <> 200000 THEN
    RAISE EXCEPTION 'BATAL: beban komisi 5-301 = % (harusnya 200.000 = 100rb Adit + 100rb Ramadan)', v_chk;
  END IF;

  -- Dana cadangan: buku besar harus sama dengan subledger, per akun.
  FOR v_ref, v_chk IN
    SELECT sf.code, COALESCE(SUM(CASE WHEN sfm.movement_type = 'deposit'
                                      THEN sfm.amount ELSE -sfm.amount END), 0)
    FROM sinking_funds sf LEFT JOIN sinking_fund_movements sfm ON sfm.fund_id = sf.id
    WHERE sf.code IN ('equipment','maintenance','emergency') GROUP BY sf.code
  LOOP
    SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0) INTO v_d
    FROM journal_lines jl WHERE jl.account_code = CASE v_ref
      WHEN 'equipment' THEN '2-200' WHEN 'maintenance' THEN '2-201' ELSE '2-203' END;
    IF v_d <> v_chk THEN
      RAISE EXCEPTION 'BATAL: dana cadangan % — buku besar % vs subledger %', v_ref, v_d, v_chk;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(debit_amount),0), COALESCE(SUM(credit_amount),0) INTO v_d, v_c FROM journal_lines;
  IF v_d <> v_c THEN RAISE EXCEPTION 'BATAL: buku tidak balance (D=% C=%)', v_d, v_c; END IF;

  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES ('commission_payout', v_payout_a, 'datafix',
    jsonb_build_object('bagian','A', 'event','PRJ-20260722-3958', 'payee','Adit Rahman',
      'komisi_dari',50000,'komisi_jadi',100000,
      'reason','Komisi naik setelah rekap (tak bisa diedit UI). Jurnal manual 23 Jul salah lawan akun (Cr BCA, bukan Cr utang komisi).'), v_actor),
    ('commission_payout', v_payout_b, 'datafix',
    jsonb_build_object('bagian','B', 'event','PRJ-20260731-36570', 'payee','Ramadan Saputra',
      'komisi_dari',0,'komisi_jadi',100000,
      'reason','Komisi sales tidak pernah diisi di event; pembayarannya dicatat sebagai "Pengeluaran" biasa.'), v_actor),
    ('crew_assignment', v_assign, 'datafix',
    jsonb_build_object('bagian','C', 'event','PRJ-20260731-36570',
      'crew_dari','Fahmi Kurniawan','crew_jadi','Rangga Ramadhan',
      'reason','Yang bertugas & menerima transfer Rangga Ramadhan; nominal & pembayaran sudah benar.'), v_actor);

  RAISE NOTICE 'OK: komisi Adit 50rb→100rb (lunas), komisi sales Ramadan 100rb dicatat & lunas, crew PT Gratama jadi Rangga Ramadhan. Utang komisi 0, beban komisi 200rb, buku balance.';
END
$fix$;
