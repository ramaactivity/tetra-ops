-- 20260804_payment_precutoff_guard.sql
-- ============================================================================
-- Tolak Log payment bertanggal SEBELUM cutoff keuangan.
-- ============================================================================
--
-- Masalah yang ditambal (temuan audit PRJ-20260808-8397, 4 Agu 2026):
--   record_payment_je membukukan jurnal dengan entry_date = p_payment_date,
--   tanpa memeriksa system_config.finance_cutoff_date. Neraca & Bagan Akun
--   menjumlahkan SEMUA journal_lines tanpa filter tanggal, jadi payment yang
--   dicatat mundur ke sebelum cutoff akan menambah Dr 1-1xx di atas saldo awal
--   — padahal uang itu SUDAH tercakup dalam saldo awal hasil hitung fisik saat
--   cutoff. Efeknya kas dobel-hitung + pendapatan nyangkut di periode tutup.
--
--   Trigger freeze cutoff (20260624) hanya menjaga event_settlements dan
--   stock_movements. Tabel payments tidak dijaga sama sekali, dan form tanggal
--   di UI bebas — jadi ini murni menunggu terjadi.
--
-- Yang dilakukan:
--   Guard di record_payment_je_impl (jalur atomik satu-satunya untuk Log
--   payment). Sisa body identik dengan 20260625_revenue_by_service.sql.
--
-- Sengaja TIDAK dipasang sebagai trigger di tabel payments: perbaikan data
-- pre-cutoff lewat service_role (mis. koreksi salah input) harus tetap bisa
-- menulis baris payment TANPA jurnal — itu justru perlakuan yang benar untuk
-- uang yang sudah masuk saldo awal.
--
-- Idempotent — CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION record_payment_je_impl(
  p_event_id         uuid,
  p_amount           bigint,
  p_payment_date     date,
  p_bank_account_id  uuid,
  p_payment_type     text,
  p_proof_url        text,
  p_notes            text,
  p_actor            uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role        text;
  v_bank_coa    text;
  v_service     text;
  v_rev_coa     text;
  v_pay_ref     text;
  v_je_ref      text;
  v_payment_id  uuid;
  v_je_id       uuid;
  v_cutoff      date;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_actor;
  IF v_role IS NULL OR v_role NOT IN ('owner','super_admin') THEN
    RAISE EXCEPTION 'Forbidden: actor bukan owner/super_admin' USING ERRCODE = '42501';
  END IF;

  -- Guard cutoff: uang yang masuk sebelum titik nol pembukuan sudah ada di
  -- saldo awal. Menjurnalnya lagi = dobel-hitung kas.
  SELECT (value #>> '{}')::date INTO v_cutoff
  FROM system_config WHERE key = 'finance_cutoff_date';

  IF v_cutoff IS NOT NULL AND p_payment_date < v_cutoff THEN
    RAISE EXCEPTION
      'Tanggal pembayaran (%) sebelum cutoff keuangan (%). Uang yang masuk sebelum cutoff sudah termasuk di saldo awal — mencatatnya lagi bikin kas dobel. Hubungi admin kalau ini koreksi data lama.',
      to_char(p_payment_date, 'DD/MM/YYYY'), to_char(v_cutoff, 'DD/MM/YYYY')
      USING ERRCODE = '22007';
  END IF;

  SELECT coa_code INTO v_bank_coa FROM bank_accounts WHERE id = p_bank_account_id;
  IF v_bank_coa IS NULL THEN
    RAISE EXCEPTION 'Rekening bank tidak ditemukan / belum punya akun COA' USING ERRCODE = 'P0002';
  END IF;

  -- Akun pendapatan per jenis layanan event (fallback 4-100).
  SELECT service_type::text INTO v_service FROM events WHERE id = p_event_id;
  v_rev_coa := CASE v_service
    WHEN 'photobooth_classic' THEN '4-100'
    WHEN 'videobooth_360'     THEN '4-110'
    WHEN 'magazine_combo'     THEN '4-120'
    WHEN 'magazine_box_only'  THEN '4-120'
    WHEN 'photostage_only'    THEN '4-130'
    WHEN 'photostage_combo'   THEN '4-130'
    ELSE '4-100'
  END;

  v_pay_ref := 'PAY-' || to_char(p_payment_date, 'YYYYMMDD') || '-'
               || LPAD((random() * 9999)::int::text, 4, '0');

  INSERT INTO payments (
    ref_id, event_id, amount, payment_date, bank_account_id,
    payment_type, proof_url, notes, recorded_by
  ) VALUES (
    v_pay_ref, p_event_id, p_amount, p_payment_date, p_bank_account_id,
    p_payment_type, p_proof_url, p_notes, p_actor
  ) RETURNING id INTO v_payment_id;

  v_je_ref := generate_journal_reference(p_payment_date);
  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description,
    source_type, source_id, source_event_id, total_amount, created_by
  ) VALUES (
    v_je_ref, p_payment_date, 'revenue',
    'Pembayaran klien ' || v_pay_ref,
    'payment', v_payment_id, p_event_id, p_amount, p_actor
  ) RETURNING id INTO v_je_id;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES
    (v_je_id, v_bank_coa, p_amount, 0, 'Uang masuk ke ' || v_bank_coa, 0),
    (v_je_id, v_rev_coa, 0, p_amount, 'Pendapatan event (' || COALESCE(v_service,'?') || ')', 1);

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION record_payment_je_impl(uuid, bigint, date, uuid, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
