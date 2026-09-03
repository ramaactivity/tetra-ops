-- ============================================================================
-- 20260811b_owner_withdrawal_admin_fee.sql
--
-- Biaya admin bank PER OWNER saat ambil bagi hasil.
--
-- Tiap owner punya rekening di bank yang berbeda, jadi ongkos transfernya juga
-- beda: sesama bank gratis, BI-FAST Rp2.500, antar-bank biasa Rp6.500. Sampai
-- sekarang RPC withdrawal hanya mengeluarkan kas sebesar jatah owner, jadi
-- ongkos transfernya tidak pernah masuk buku — kas riil di bank berkurang
-- lebih banyak daripada yang tercatat, dan selisihnya baru ketahuan saat
-- rekonsiliasi.
--
-- Perlakuannya SAMA dengan bayar fee crew & bayar hutang (5-600, ditanggung
-- perusahaan): owner tetap menerima jatah penuh, ongkos transfer jadi beban.
--
--   Dr 2-300 Bagi Hasil Owner       = jatah owner
--   Dr 5-600 Beban Administrasi Bank= biaya admin (kalau ada)
--   Cr kas/bank                     = jatah + biaya admin
--
-- Sisa bagi hasil owner (owner_earnings) tetap berkurang sebesar JATAH saja —
-- biaya admin bukan potongan jatah owner.
--
-- Fungsi lama (tanpa parameter fee) DI-DROP, bukan di-overload: dua fungsi
-- dengan nama sama + parameter default = pemanggilan 8-argumen jadi ambigu.
-- ============================================================================

-- 1. Wrapper & impl lama dibuang dulu (signature berubah) -------------------
DROP FUNCTION IF EXISTS public.record_owner_withdrawal(uuid, bigint, uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.record_owner_withdrawal_impl(uuid, bigint, uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.record_all_owner_withdrawals(uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.record_all_owner_withdrawals_impl(uuid, text, text, text, text, uuid);

-- 2. Withdrawal satu owner + biaya admin -----------------------------------
--    Salinan definisi 20260806 (aturan periode & lock owner tetap), yang baru
--    hanya p_admin_fee dan baris jurnalnya.
CREATE OR REPLACE FUNCTION public.record_owner_withdrawal_impl(
  p_owner_user_id uuid, p_amount bigint, p_bank_account_id uuid, p_method text,
  p_account text, p_reference text, p_description text, p_actor uuid,
  p_admin_fee bigint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_role  TEXT;
  v_target_role TEXT;
  v_owner_name  TEXT;
  v_balance     BIGINT;
  v_pending     BIGINT;
  v_bank_coa    TEXT;
  v_bank_name   TEXT;
  v_bank_active BOOLEAN;
  v_ref         TEXT;
  v_entry_id    UUID;
  v_desc        TEXT;
  v_fee         BIGINT := COALESCE(p_admin_fee, 0);
  v_cash_out    BIGINT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Jumlah withdrawal harus > 0' USING ERRCODE = '22023';
  END IF;
  IF v_fee < 0 THEN
    RAISE EXCEPTION 'Biaya admin tidak boleh negatif' USING ERRCODE = '22023';
  END IF;
  -- Pagar salah ketik: ongkos transfer bank puluhan ribu, bukan jutaan.
  IF v_fee > 1000000 THEN
    RAISE EXCEPTION 'Biaya admin % tidak masuk akal (maks 1.000.000)', v_fee
      USING ERRCODE = '22023';
  END IF;
  v_cash_out := p_amount + v_fee;

  SELECT role INTO v_actor_role FROM users WHERE id = p_actor;
  IF v_actor_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: hanya super_admin yang bisa rekam withdrawal'
      USING ERRCODE = '42501';
  END IF;

  -- Lock baris owner → serialisasi withdrawal beruntun (tutup TOCTOU).
  SELECT role, full_name INTO v_target_role, v_owner_name
  FROM users WHERE id = p_owner_user_id FOR UPDATE;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Owner tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  IF v_target_role NOT IN ('super_admin', 'owner') THEN
    RAISE EXCEPTION 'Target bukan super_admin / owner' USING ERRCODE = '22023';
  END IF;

  -- Hanya jatah dari bulan yang sudah lewat yang boleh ditarik.
  v_balance := owner_withdrawable_balance(p_owner_user_id);

  IF p_amount > v_balance THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_pending
    FROM owner_earnings
    WHERE owner_user_id = p_owner_user_id
      AND amount > 0
      AND period_month >= date_trunc('month', CURRENT_DATE)::date;
    IF v_pending > 0 THEN
      RAISE EXCEPTION 'Bisa diambil sekarang %, diminta %. Bagi hasil bulan berjalan (%) baru bisa diambil bulan depan.',
        v_balance, p_amount, v_pending USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'Saldo tidak cukup. Available: %, request: %', v_balance, p_amount
      USING ERRCODE = '23514';
  END IF;

  SELECT coa_code, account_name, is_active
  INTO v_bank_coa, v_bank_name, v_bank_active
  FROM bank_accounts WHERE id = p_bank_account_id;
  IF v_bank_coa IS NULL THEN
    RAISE EXCEPTION 'Kas/bank sumber tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_bank_active THEN
    RAISE EXCEPTION 'Kas/bank % nonaktif', v_bank_name USING ERRCODE = '22023';
  END IF;

  -- Deskripsi jurnal: "<periode/desc> — <Nama Owner>" (jelas per owner).
  v_desc := COALESCE(NULLIF(p_description, ''), 'Bagi hasil owner')
            || ' — ' || COALESCE(v_owner_name, 'Owner');

  v_ref := generate_journal_reference(CURRENT_DATE);
  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description,
    source_type, source_id, total_amount, created_by
  ) VALUES (
    v_ref, CURRENT_DATE, 'asset_out',
    v_desc,
    'owner_withdrawal', p_owner_user_id, v_cash_out, p_actor
  ) RETURNING id INTO v_entry_id;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES (
    v_entry_id, '2-300', p_amount, 0,
    'Bagi hasil ' || COALESCE(v_owner_name, 'owner') || ' dibayar', 1);

  -- Ongkos transfer ke rekening owner ini — beban perusahaan, BUKAN potongan
  -- jatah owner (owner tetap menerima penuh).
  IF v_fee > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    VALUES (
      v_entry_id, '5-600', v_fee, 0,
      'Biaya admin transfer ke ' || COALESCE(v_owner_name, 'owner'), 2);
  END IF;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES (
    v_entry_id, v_bank_coa, 0, v_cash_out,
    'Kas keluar (' || v_bank_name || ')', 3);

  INSERT INTO owner_earnings (
    owner_user_id, earning_type, amount, description,
    withdrawal_method, withdrawal_account, withdrawal_reference, performed_by
  ) VALUES (
    p_owner_user_id, 'withdrawal', -p_amount, p_description,
    p_method, p_account, p_reference, p_actor
  );

  RETURN jsonb_build_object(
    'journal_entry_id', v_entry_id,
    'ref_id', v_ref,
    'admin_fee', v_fee,
    'cash_out', v_cash_out,
    'new_balance', v_balance - p_amount
  );
END;
$function$;

COMMENT ON FUNCTION public.record_owner_withdrawal_impl IS
  'Catat pengambilan bagi hasil satu owner: Dr 2-300 (jatah) + Dr 5-600 (biaya admin transfer, opsional) / Cr kas-bank sebesar jatah+admin. owner_earnings berkurang sebesar JATAH saja — biaya admin ditanggung perusahaan.';

-- 3. Ambil semua owner sekaligus — biaya admin per owner --------------------
--    p_admin_fees: {"<owner_user_id>": <biaya>} — tiap owner beda rekening,
--    jadi ongkos transfernya juga beda.
CREATE OR REPLACE FUNCTION public.record_all_owner_withdrawals_impl(
  p_bank_account_id uuid, p_method text, p_account text, p_reference text,
  p_description text, p_actor uuid, p_admin_fees jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_role  TEXT;
  v_bank_coa    TEXT;
  v_bank_name   TEXT;
  v_bank_active BOOLEAN;
  v_total       BIGINT;
  v_fee_total   BIGINT := 0;
  v_cash        BIGINT;
  v_owner       RECORD;
  v_balance     BIGINT;
  v_fee         BIGINT;
  v_count       INT := 0;
  v_res         JSONB;
  v_refs        JSONB := '[]'::jsonb;
  v_fees        JSONB := COALESCE(p_admin_fees, '{}'::jsonb);
BEGIN
  SELECT role INTO v_actor_role FROM users WHERE id = p_actor;
  IF v_actor_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: hanya super_admin yang bisa rekam withdrawal'
      USING ERRCODE = '42501';
  END IF;

  SELECT coa_code, account_name, is_active
    INTO v_bank_coa, v_bank_name, v_bank_active
    FROM bank_accounts WHERE id = p_bank_account_id;
  IF v_bank_coa IS NULL THEN
    RAISE EXCEPTION 'Kas/bank sumber tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_bank_active THEN
    RAISE EXCEPTION 'Kas/bank % nonaktif', v_bank_name USING ERRCODE = '22023';
  END IF;

  -- Total = jumlah saldo yang BOLEH ditarik tiap owner aktif + ongkos
  -- transfernya masing-masing (kas keluar sebenarnya).
  SELECT COALESCE(SUM(bal), 0),
         COALESCE(SUM(COALESCE((v_fees ->> id::text)::bigint, 0)), 0)
    INTO v_total, v_fee_total
  FROM (
    SELECT u.id, owner_withdrawable_balance(u.id) AS bal
    FROM users u
    WHERE u.role = 'owner' AND u.is_active = true
  ) s WHERE bal > 0;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Belum ada bagi hasil yang bisa ditarik. Jatah dari event bulan ini baru bisa diambil bulan depan.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) INTO v_cash
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
   WHERE jl.account_code = v_bank_coa AND je.is_reversed = false;
  IF v_cash < v_total + v_fee_total THEN
    RAISE EXCEPTION 'Saldo % tidak cukup untuk ambil semua (butuh % + biaya admin %, tersedia %)',
      v_bank_name, v_total, v_fee_total, v_cash USING ERRCODE = '23514';
  END IF;

  FOR v_owner IN
    SELECT id, full_name FROM users
    WHERE role = 'owner' AND is_active = true ORDER BY full_name
  LOOP
    v_balance := owner_withdrawable_balance(v_owner.id);
    IF v_balance > 0 THEN
      v_fee := COALESCE((v_fees ->> v_owner.id::text)::bigint, 0);
      v_res := record_owner_withdrawal(
        v_owner.id, v_balance, p_bank_account_id,
        p_method, p_account, p_reference, p_description, p_actor, v_fee
      );
      v_refs := v_refs || jsonb_build_object(
        'owner_user_id', v_owner.id,
        'full_name',     v_owner.full_name,
        'amount',        v_balance,
        'admin_fee',     v_fee,
        'ref_id',        v_res->>'ref_id'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'owners', v_count, 'total', v_total,
    'admin_fee_total', v_fee_total,
    'cash_out', v_total + v_fee_total,
    'refs', v_refs);
END;
$function$;

COMMENT ON FUNCTION public.record_all_owner_withdrawals_impl IS
  'Ambil bagi hasil semua owner sekaligus. p_admin_fees = {"<owner_user_id>": biaya} — ongkos transfer per owner (rekening tiap owner beda bank), dibukukan Dr 5-600 dan menambah kas keluar.';

-- 4. Wrapper ber-guard (pola 20260721b) ------------------------------------
CREATE OR REPLACE FUNCTION public.record_owner_withdrawal(
  p_owner_user_id uuid, p_amount bigint, p_bank_account_id uuid, p_method text,
  p_account text, p_reference text, p_description text, p_actor uuid,
  p_admin_fee bigint DEFAULT 0)
RETURNS jsonb AS $$
BEGIN
  PERFORM require_owner_level_rpc('record_owner_withdrawal');
  RETURN record_owner_withdrawal_impl(p_owner_user_id, p_amount, p_bank_account_id,
    p_method, p_account, p_reference, p_description, p_actor, p_admin_fee);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.record_all_owner_withdrawals(
  p_bank_account_id uuid, p_method text, p_account text, p_reference text,
  p_description text, p_actor uuid, p_admin_fees jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb AS $$
BEGIN
  PERFORM require_owner_level_rpc('record_all_owner_withdrawals');
  RETURN record_all_owner_withdrawals_impl(p_bank_account_id, p_method, p_account,
    p_reference, p_description, p_actor, p_admin_fees);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5. Hak akses: anon TIDAK boleh, _impl hanya lewat wrapper ----------------
REVOKE ALL ON FUNCTION public.record_owner_withdrawal(uuid, bigint, uuid, text, text, text, text, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_owner_withdrawal(uuid, bigint, uuid, text, text, text, text, uuid, bigint) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_all_owner_withdrawals(uuid, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_all_owner_withdrawals(uuid, text, text, text, text, uuid, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_owner_withdrawal_impl(uuid, bigint, uuid, text, text, text, text, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_owner_withdrawal_impl(uuid, bigint, uuid, text, text, text, text, uuid, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.record_all_owner_withdrawals_impl(uuid, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_all_owner_withdrawals_impl(uuid, text, text, text, text, uuid, jsonb) TO service_role;

-- 6. Uji jurnal (dijalankan sungguhan lalu di-ROLLBACK) ---------------------
--    Menabrak jurnalnya sekarang jauh lebih murah daripada menemukan kas
--    selisih Rp2.500 tiga bulan lagi.
DO $test$
DECLARE
  v_actor  UUID;
  v_owner  UUID;
  v_bal    BIGINT;
  v_bank   UUID;
  v_res    JSONB;
  v_entry  UUID;
  v_dr_pool BIGINT; v_dr_fee BIGINT; v_cr_bank BIGINT; v_earn BIGINT;
BEGIN
  BEGIN
    SELECT id INTO v_actor FROM users WHERE role = 'super_admin' AND is_active LIMIT 1;
    SELECT id INTO v_bank FROM bank_accounts WHERE is_active ORDER BY coa_code LIMIT 1;
    SELECT u.id, owner_withdrawable_balance(u.id) INTO v_owner, v_bal
    FROM users u WHERE u.role = 'owner' AND u.is_active
      AND owner_withdrawable_balance(u.id) > 0
    ORDER BY u.full_name LIMIT 1;

    IF v_actor IS NULL OR v_bank IS NULL OR v_owner IS NULL THEN
      RAISE NOTICE 'Uji dilewati (belum ada owner bersaldo / kas aktif).';
      RETURN;
    END IF;

    v_res := record_owner_withdrawal_impl(
      v_owner, v_bal, v_bank, 'transfer', NULL, NULL, 'UJI biaya admin', v_actor, 2500);
    v_entry := (v_res->>'journal_entry_id')::uuid;

    SELECT COALESCE(SUM(debit_amount) FILTER (WHERE account_code = '2-300'), 0),
           COALESCE(SUM(debit_amount) FILTER (WHERE account_code = '5-600'), 0),
           COALESCE(SUM(credit_amount), 0)
      INTO v_dr_pool, v_dr_fee, v_cr_bank
      FROM journal_lines WHERE entry_id = v_entry;

    SELECT COALESCE(SUM(amount), 0) INTO v_earn
      FROM owner_earnings
     WHERE owner_user_id = v_owner AND earning_type = 'withdrawal'
       AND description = 'UJI biaya admin';

    IF v_dr_pool <> v_bal THEN
      RAISE EXCEPTION 'UJI GAGAL: Dr 2-300 % ≠ jatah %', v_dr_pool, v_bal;
    END IF;
    IF v_dr_fee <> 2500 THEN
      RAISE EXCEPTION 'UJI GAGAL: Dr 5-600 % ≠ 2500', v_dr_fee;
    END IF;
    IF v_cr_bank <> v_bal + 2500 THEN
      RAISE EXCEPTION 'UJI GAGAL: kas keluar % ≠ %', v_cr_bank, v_bal + 2500;
    END IF;
    IF v_earn <> -v_bal THEN
      RAISE EXCEPTION 'UJI GAGAL: owner_earnings % ≠ % (biaya admin tidak boleh memotong jatah owner)',
        v_earn, -v_bal;
    END IF;

    RAISE EXCEPTION 'ROLLBACK_TEST_OK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TEST_OK' THEN RAISE; END IF;
    RAISE NOTICE 'Uji jurnal biaya admin owner LULUS (perubahan di-rollback).';
  END;
END
$test$;
