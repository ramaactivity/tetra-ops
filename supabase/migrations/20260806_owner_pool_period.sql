-- ============================================================================
-- 20260806_owner_pool_period.sql
--
-- Bagi hasil owner punya ATURAN PERIODE yang selama ini cuma ada di kepala:
-- jatah dari event bulan M baru boleh dicairkan mulai bulan M+1 (ditarik di
-- awal bulan berikutnya). Sistem belum tahu aturan itu — "Bisa diambil"
-- dihitung SUM(owner_earnings) apa adanya, jadi jatah dari event bulan yang
-- masih berjalan ikut terhitung bisa ditarik.
--
-- Contoh nyata 2026-08-06 (yang bikin owner curiga): tampil "Bisa diambil
-- Rp150.000" padahal yang benar Rp100.000 —
--     Juni 2026     Rp500.000  (9 event pra-cutoff + Farah & Ryan) → sudah ditarik 2 Jul
--     Juli 2026     Rp100.000  (Yokke 22 Jul + PT. Gratama 31 Jul)  → BOLEH ditarik
--     Agustus 2026   Rp50.000  (Hafizh & Dinda 1 Agu)               → belum, bulan berjalan
--
-- Catatan: PT. Gratama event 31 Juli tapi baru di-settle 2 Agustus. Periodenya
-- mengikuti TANGGAL EVENT (Juli), bukan tanggal settle — bagi hasil "bulan
-- Juli" artinya hasil dari event-event yang jalan di bulan Juli.
--
-- Yang dikerjakan:
--   1. Kolom owner_earnings.period_month (tanggal 1 tiap bulan) + backfill
--   2. Trigger pengisi otomatis → settle_event dkk tak perlu diubah
--   3. Fungsi owner_withdrawable_balance() — satu sumber kebenaran
--   4. record_owner_withdrawal_impl & record_all_owner_withdrawals_impl pakai
--      saldo yang boleh ditarik itu (guard server-side, bukan cuma tampilan)
--
-- Tidak ada angka uang yang berubah: sub-ledger & GL tetap sama persis, yang
-- berubah cuma BERAPA yang boleh ditarik sekarang.
-- ============================================================================

-- 1. Kolom periode --------------------------------------------------------
ALTER TABLE owner_earnings
  ADD COLUMN IF NOT EXISTS period_month DATE;

COMMENT ON COLUMN owner_earnings.period_month IS
  'Bulan asal jatah bagi hasil (tanggal 1). Diambil dari tanggal EVENT, bukan tanggal settle. Jatah bulan berjalan belum boleh ditarik — lihat owner_withdrawable_balance().';

-- Backfill: jatah per event → bulan event-nya.
UPDATE owner_earnings oe
SET period_month = date_trunc('month', e.event_date)::date
FROM events e
WHERE e.id = oe.source_event_id AND oe.period_month IS NULL;

-- Backfill sisanya (koreksi manual & withdrawal) → bulan saat dicatat.
UPDATE owner_earnings
SET period_month = date_trunc('month', created_at)::date
WHERE period_month IS NULL;

-- Koreksi khusus: adjustment 2 Juli 2026 sebenarnya jatah 9 event JUNI yang
-- terhapus saat cutoff (lihat 20260702_owner_pool_june_precutoff_correction).
-- Tanpa ini, jatah Juni itu terbaca sebagai jatah Juli.
UPDATE owner_earnings
SET period_month = DATE '2026-06-01'
WHERE earning_type = 'adjustment'
  AND description ILIKE '%event Juni%'
  AND period_month = DATE '2026-07-01';

CREATE INDEX IF NOT EXISTS ix_owner_earnings_owner_period
  ON owner_earnings (owner_user_id, period_month);

-- 2. Trigger pengisi otomatis ---------------------------------------------
CREATE OR REPLACE FUNCTION owner_earnings_fill_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.period_month IS NULL THEN
    IF NEW.source_event_id IS NOT NULL THEN
      SELECT date_trunc('month', event_date)::date INTO NEW.period_month
      FROM events WHERE id = NEW.source_event_id;
    END IF;
    IF NEW.period_month IS NULL THEN
      NEW.period_month := date_trunc('month', COALESCE(NEW.created_at, NOW()))::date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_earnings_fill_period ON owner_earnings;
CREATE TRIGGER trg_owner_earnings_fill_period
  BEFORE INSERT ON owner_earnings
  FOR EACH ROW EXECUTE FUNCTION owner_earnings_fill_period();

COMMENT ON FUNCTION owner_earnings_fill_period IS
  'Isi period_month otomatis dari tanggal event (kalau ada), kalau tidak dari tanggal catat. Dipasang sebagai trigger supaya settle_event & RPC withdrawal tidak perlu diubah.';

-- 3. Saldo yang BOLEH ditarik ---------------------------------------------
CREATE OR REPLACE FUNCTION owner_withdrawable_balance(p_owner_user_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Semua penarikan (nilainya negatif) selalu ikut; jatah hanya ikut kalau
  -- periodenya sudah lewat (bulan berjalan belum boleh ditarik).
  SELECT COALESCE(SUM(amount), 0)::BIGINT
  FROM owner_earnings
  WHERE owner_user_id = p_owner_user_id
    AND (amount < 0 OR period_month < date_trunc('month', CURRENT_DATE)::date);
$$;

COMMENT ON FUNCTION owner_withdrawable_balance IS
  'Bagi hasil yang boleh dicairkan owner saat ini: total jatah dari bulan-bulan yang SUDAH lewat dikurangi yang sudah ditarik. Jatah bulan berjalan sengaja tidak dihitung — baru bisa diambil bulan depan.';

GRANT EXECUTE ON FUNCTION owner_withdrawable_balance TO authenticated, service_role;

-- 4. RPC withdrawal memakai saldo itu -------------------------------------
--    Salinan persis definisi live 2026-08-06; HANYA query saldo yang diganti
--    + pesan errornya diperjelas.
CREATE OR REPLACE FUNCTION public.record_owner_withdrawal_impl(
  p_owner_user_id uuid, p_amount bigint, p_bank_account_id uuid, p_method text,
  p_account text, p_reference text, p_description text, p_actor uuid)
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
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Jumlah withdrawal harus > 0' USING ERRCODE = '22023';
  END IF;

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
    'owner_withdrawal', p_owner_user_id, p_amount, p_actor
  ) RETURNING id INTO v_entry_id;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES
    (v_entry_id, '2-300',     p_amount, 0,
      'Bagi hasil ' || COALESCE(v_owner_name, 'owner') || ' dibayar', 1),
    (v_entry_id, v_bank_coa,  0, p_amount,
      'Kas keluar (' || v_bank_name || ')', 2);

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
    'new_balance', v_balance - p_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_all_owner_withdrawals_impl(
  p_bank_account_id uuid, p_method text, p_account text, p_reference text,
  p_description text, p_actor uuid)
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
  v_cash        BIGINT;
  v_owner       RECORD;
  v_balance     BIGINT;
  v_count       INT := 0;
  v_res         JSONB;
  v_refs        JSONB := '[]'::jsonb;
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

  -- Total = jumlah saldo yang BOLEH ditarik tiap owner aktif.
  SELECT COALESCE(SUM(bal), 0) INTO v_total FROM (
    SELECT owner_withdrawable_balance(u.id) AS bal
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
  IF v_cash < v_total THEN
    RAISE EXCEPTION 'Saldo % tidak cukup untuk ambil semua (butuh %, tersedia %)',
      v_bank_name, v_total, v_cash USING ERRCODE = '23514';
  END IF;

  FOR v_owner IN
    SELECT id, full_name FROM users
    WHERE role = 'owner' AND is_active = true ORDER BY full_name
  LOOP
    v_balance := owner_withdrawable_balance(v_owner.id);
    IF v_balance > 0 THEN
      v_res := record_owner_withdrawal(
        v_owner.id, v_balance, p_bank_account_id,
        p_method, p_account, p_reference, p_description, p_actor
      );
      v_refs := v_refs || jsonb_build_object(
        'owner_user_id', v_owner.id,
        'full_name',     v_owner.full_name,
        'amount',        v_balance,
        'ref_id',        v_res->>'ref_id'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('owners', v_count, 'total', v_total, 'refs', v_refs);
END;
$function$;

-- 5. Verifikasi ------------------------------------------------------------
DO $verify$
DECLARE
  r RECORD;
  v_total_sisa BIGINT := 0;
  v_total_bisa BIGINT := 0;
BEGIN
  FOR r IN
    SELECT u.id, u.full_name,
           COALESCE(SUM(oe.amount), 0) AS sisa,
           owner_withdrawable_balance(u.id) AS bisa
    FROM users u LEFT JOIN owner_earnings oe ON oe.owner_user_id = u.id
    WHERE u.role = 'owner' AND u.is_active = true
    GROUP BY u.id, u.full_name ORDER BY u.full_name
  LOOP
    v_total_sisa := v_total_sisa + r.sisa;
    v_total_bisa := v_total_bisa + r.bisa;
    RAISE NOTICE '  % — sisa % · bisa diambil sekarang %', r.full_name, r.sisa, r.bisa;
  END LOOP;

  IF EXISTS (SELECT 1 FROM owner_earnings WHERE period_month IS NULL) THEN
    RAISE EXCEPTION 'Masih ada owner_earnings tanpa period_month.';
  END IF;

  RAISE NOTICE 'Total sisa % (harus tetap = saldo GL 2-300), boleh ditarik sekarang %',
    v_total_sisa, v_total_bisa;
END
$verify$;
