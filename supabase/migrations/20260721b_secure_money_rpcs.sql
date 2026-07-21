-- ============================================================================
-- 20260721b — FIX: RPC uang bisa dipanggil langsung dari browser
-- ============================================================================
-- MASALAH (diverifikasi terhadap DB produksi 2026-07-21)
--   Seluruh RPC di bawah: prosecdef = true (SECURITY DEFINER → bypass RLS),
--   EXECUTE ter-grant ke `anon` DAN `authenticated`, dan TIDAK SATU PUN
--   menyebut auth.uid() di badannya. Otorisasinya bergantung pada parameter
--   yang dikirim pemanggil (p_actor / p_owner_user_id) atau tidak ada sama
--   sekali.
--
--   Karena `anon` pun bisa EXECUTE, penyerang bahkan TIDAK PERLU login:
--   cukup anon key publik (yang memang ada di bundle browser) lalu
--   POST /rest/v1/rpc/settle_event. Untuk yang menjaga lewat p_actor,
--   kirim UUID owner mana pun yang diketahui → guard lolos.
--   execute_finance_cutoff MENGHAPUS 12 tabel ledger.
--
--   Komentar di 20260507_settlement_close_function.sql:326 mendokumentasikan
--   asumsi yang tidak pernah benar: "The server action enforces
--   super_admin/owner role-check before calling." Server action memang cek,
--   tapi RPC-nya tidak wajib lewat server action.
--
-- STRATEGI: WRAPPER, bukan tulis ulang
--   Badan fungsi TIDAK disentuh sama sekali. Untuk tiap fungsi:
--     1. ALTER ... RENAME TO <nama>_impl   (badan asli utuh, tak tersalin)
--     2. REVOKE EXECUTE pada _impl dari PUBLIC/anon/authenticated
--     3. CREATE wrapper bernama SAMA + signature SAMA, yang memanggil guard
--        lalu meneruskan ke _impl
--   Ini penting karena settle_event saja 15KB: menyalin badannya dari file
--   migrasi ke migrasi baru berisiko MEMUNDURKAN logika kalau versi live
--   ternyata sudah berbeda (dan fungsi _tmp_q membuktikan DDL di luar
--   version control memang terjadi di repo ini).
--
--   Parameter p_actor SENGAJA dibiarkan di signature — dipakai untuk kolom
--   audit di dalam badan fungsi. Yang berubah: nilainya tidak lagi menjadi
--   dasar otorisasi.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Guard bersama
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION require_owner_level_rpc(p_fn text)
RETURNS void AS $$
DECLARE
  v_claims text;
  v_jwt_role text;
BEGIN
  -- PostgREST menaruh klaim JWT di sini. NULLIF: saat kosong (mis. panggilan
  -- internal DB), ::jsonb akan error kalau tidak dijaga.
  v_claims := current_setting('request.jwt.claims', true);
  v_jwt_role := COALESCE(NULLIF(v_claims, '')::jsonb ->> 'role', '');

  -- Jalur server/cron memakai service key → lewat. Ini yang menjaga
  -- /api/cron/depreciation tetap jalan.
  IF v_jwt_role = 'service_role' THEN
    RETURN;
  END IF;

  IF NOT is_owner_level() THEN
    RAISE EXCEPTION 'Forbidden: % hanya untuk owner/super_admin', p_fn
      USING ERRCODE = '42501';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION require_owner_level_rpc(text) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 2. Rename fungsi asli → _impl (idempoten: lewati kalau sudah ada)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  v_sig text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('settle_event',                  'uuid, uuid, jsonb'),
      ('reopen_settlement',             'uuid, uuid, text'),
      ('record_payment_je',             'uuid, bigint, date, uuid, text, text, text, uuid'),
      ('reverse_payment_je',            'uuid, uuid, text'),
      ('record_owner_withdrawal',       'uuid, bigint, uuid, text, text, text, text, uuid'),
      ('record_all_owner_withdrawals',  'uuid, text, text, text, text, uuid'),
      ('execute_finance_cutoff',        'uuid, date, bigint, jsonb, jsonb'),
      ('admin_close_frozen_event',      'uuid, uuid'),
      ('accrue_monthly_depreciation',   'text, uuid'),
      ('recompute_weighted_avg_cost',   'uuid, numeric, numeric'),
      ('get_consumption_per_event_avg', '')
    ) AS x(fn, args)
  LOOP
    v_sig := format('public.%I(%s)', t.fn, t.args);

    -- Sudah pernah dijalankan? (_impl ada) → lewati.
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = t.fn || '_impl'
    ) THEN
      RAISE NOTICE 'lewati %, _impl sudah ada', t.fn;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = t.fn
    ) THEN
      RAISE NOTICE 'lewati %, fungsi tidak ada di DB ini', t.fn;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER FUNCTION %s RENAME TO %I', v_sig, t.fn || '_impl');
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      t.fn || '_impl', t.args
    );
    RAISE NOTICE 'rename % → %_impl (execute dicabut)', t.fn, t.fn;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Wrapper ber-guard — nama & signature identik dengan aslinya
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION settle_event(p_event_id uuid, p_owner_user_id uuid, p_overrides jsonb)
RETURNS jsonb AS $$
BEGIN
  PERFORM require_owner_level_rpc('settle_event');
  RETURN settle_event_impl(p_event_id, p_owner_user_id, p_overrides);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION reopen_settlement(p_event_id uuid, p_owner_user_id uuid, p_reason text)
RETURNS jsonb AS $$
BEGIN
  PERFORM require_owner_level_rpc('reopen_settlement');
  RETURN reopen_settlement_impl(p_event_id, p_owner_user_id, p_reason);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION record_payment_je(
  p_event_id uuid, p_amount bigint, p_payment_date date, p_bank_account_id uuid,
  p_payment_type text, p_proof_url text, p_notes text, p_actor uuid)
RETURNS uuid AS $$
BEGIN
  PERFORM require_owner_level_rpc('record_payment_je');
  RETURN record_payment_je_impl(p_event_id, p_amount, p_payment_date,
    p_bank_account_id, p_payment_type, p_proof_url, p_notes, p_actor);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION reverse_payment_je(p_payment_id uuid, p_actor uuid, p_reason text)
RETURNS void AS $$
BEGIN
  PERFORM require_owner_level_rpc('reverse_payment_je');
  PERFORM reverse_payment_je_impl(p_payment_id, p_actor, p_reason);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION record_owner_withdrawal(
  p_owner_user_id uuid, p_amount bigint, p_bank_account_id uuid, p_method text,
  p_account text, p_reference text, p_description text, p_actor uuid)
RETURNS jsonb AS $$
BEGIN
  PERFORM require_owner_level_rpc('record_owner_withdrawal');
  RETURN record_owner_withdrawal_impl(p_owner_user_id, p_amount, p_bank_account_id,
    p_method, p_account, p_reference, p_description, p_actor);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION record_all_owner_withdrawals(
  p_bank_account_id uuid, p_method text, p_account text, p_reference text,
  p_description text, p_actor uuid)
RETURNS jsonb AS $$
BEGIN
  PERFORM require_owner_level_rpc('record_all_owner_withdrawals');
  RETURN record_all_owner_withdrawals_impl(p_bank_account_id, p_method, p_account,
    p_reference, p_description, p_actor);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION execute_finance_cutoff(
  p_actor uuid, p_cutoff_date date, p_cash bigint, p_banks jsonb, p_items jsonb)
RETURNS jsonb AS $$
BEGIN
  PERFORM require_owner_level_rpc('execute_finance_cutoff');
  RETURN execute_finance_cutoff_impl(p_actor, p_cutoff_date, p_cash, p_banks, p_items);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION admin_close_frozen_event(p_event_id uuid, p_actor_id uuid)
RETURNS jsonb AS $$
BEGIN
  PERFORM require_owner_level_rpc('admin_close_frozen_event');
  RETURN admin_close_frozen_event_impl(p_event_id, p_actor_id);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION accrue_monthly_depreciation(p_period_ym text, p_actor uuid)
RETURNS TABLE(posted_count integer, skipped_count integer, total_amount bigint) AS $$
BEGIN
  PERFORM require_owner_level_rpc('accrue_monthly_depreciation');
  RETURN QUERY SELECT * FROM accrue_monthly_depreciation_impl(p_period_ym, p_actor);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recompute_weighted_avg_cost(
  p_item_id uuid, p_incoming_qty numeric, p_incoming_cost numeric)
RETURNS bigint AS $$
BEGIN
  PERFORM require_owner_level_rpc('recompute_weighted_avg_cost');
  RETURN recompute_weighted_avg_cost_impl(p_item_id, p_incoming_qty, p_incoming_cost);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION get_consumption_per_event_avg()
RETURNS TABLE(item_id uuid, avg_per_event numeric, events_observed integer) AS $$
BEGIN
  PERFORM require_owner_level_rpc('get_consumption_per_event_avg');
  RETURN QUERY SELECT * FROM get_consumption_per_event_avg_impl();
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 4. Grant ulang wrapper: authenticated + service_role SAJA. Anon dicabut.
--    Tidak ada satu pun alur sah yang memanggil RPC ini tanpa login.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('settle_event',                  'uuid, uuid, jsonb'),
      ('reopen_settlement',             'uuid, uuid, text'),
      ('record_payment_je',             'uuid, bigint, date, uuid, text, text, text, uuid'),
      ('reverse_payment_je',            'uuid, uuid, text'),
      ('record_owner_withdrawal',       'uuid, bigint, uuid, text, text, text, text, uuid'),
      ('record_all_owner_withdrawals',  'uuid, text, text, text, text, uuid'),
      ('execute_finance_cutoff',        'uuid, date, bigint, jsonb, jsonb'),
      ('admin_close_frozen_event',      'uuid, uuid'),
      ('accrue_monthly_depreciation',   'text, uuid'),
      ('recompute_weighted_avg_cost',   'uuid, numeric, numeric'),
      ('get_consumption_per_event_avg', ''),
      -- commit_rekap_stock sudah punya guard is_owner_level() sendiri
      -- (20260619), tapi anon tetap tidak berkepentingan memanggilnya.
      ('commit_rekap_stock',            'uuid, uuid, uuid, jsonb, jsonb, bigint, uuid, boolean, text, text')
    ) AS x(fn, args)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = t.fn
    ) THEN CONTINUE; END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', t.fn, t.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', t.fn, t.args);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Bersihkan fungsi debug yang tertinggal di produksi.
--    SECURITY DEFINER, EXECUTE ke authenticated, tidak ada di migration mana
--    pun — residu sesi ad-hoc yang membocorkan finance_cutoff_date dengan
--    melewati policy owner-only milik system_config.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._tmp_q();

-- ---------------------------------------------------------------------------
-- 6. Verifikasi — gagalkan migrasi kalau masih ada lubang
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(p.proname, ', ')
  INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'settle_event','reopen_settlement','record_payment_je','reverse_payment_je',
      'record_owner_withdrawal','record_all_owner_withdrawals','execute_finance_cutoff',
      'admin_close_frozen_event','accrue_monthly_depreciation',
      'recompute_weighted_avg_cost','get_consumption_per_event_avg','commit_rekap_stock'
    )
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'anon MASIH bisa EXECUTE: %', v_bad;
  END IF;

  SELECT string_agg(p.proname, ', ')
  INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE '%\_impl'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated masih bisa memanggil _impl langsung: %', v_bad;
  END IF;

  RAISE NOTICE 'OK: wrapper terpasang, anon dicabut, _impl tertutup.';
END $$;
