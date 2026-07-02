-- 20260702c_record_all_owner_withdrawals.sql
-- ============================================================================
-- Ambil bagi hasil SEMUA owner sekaligus (1 klik) — atomik, all-or-nothing.
-- ============================================================================
--
-- Owner biasanya menarik bagi hasil semua owner sekaligus tiap awal bulan
-- (jumlah = saldo penuh masing-masing, dari 1 rekening yang sama). RPC ini
-- membungkus perulangan record_owner_withdrawal dalam SATU transaksi:
--   • Cek actor super_admin.
--   • Cek rekening sumber ada & aktif.
--   • Hitung total (jumlah saldo positif semua owner) + guard kas tidak boleh
--     minus (saldo GL rekening >= total).
--   • Loop tiap owner bersaldo > 0 → panggil record_owner_withdrawal (yang
--     sudah teruji: lock owner, jurnal Dr 2-300 / Cr kas, owner_earnings).
-- Kalau SATU gagal, seluruhnya rollback (tak ada penarikan separuh).

CREATE OR REPLACE FUNCTION record_all_owner_withdrawals(
  p_bank_account_id UUID,
  p_method          TEXT,
  p_account         TEXT,
  p_reference       TEXT,
  p_description     TEXT,
  p_actor           UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role TEXT;
  v_bank_coa   TEXT;
  v_bank_name  TEXT;
  v_bank_active BOOLEAN;
  v_total      BIGINT;
  v_cash       BIGINT;
  v_owner      RECORD;
  v_balance    BIGINT;
  v_count      INT := 0;
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

  -- Total = jumlah saldo positif tiap owner aktif
  SELECT COALESCE(SUM(bal), 0) INTO v_total FROM (
    SELECT COALESCE(SUM(oe.amount), 0) AS bal
    FROM users u
    LEFT JOIN owner_earnings oe ON oe.owner_user_id = u.id
    WHERE u.role = 'owner' AND u.is_active = true
    GROUP BY u.id
  ) s WHERE bal > 0;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Tidak ada saldo bagi hasil untuk ditarik' USING ERRCODE = '22023';
  END IF;

  -- Guard: kas/bank tidak boleh minus
  SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) INTO v_cash
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
   WHERE jl.account_code = v_bank_coa AND je.is_reversed = false;
  IF v_cash < v_total THEN
    RAISE EXCEPTION 'Saldo % tidak cukup untuk ambil semua (butuh %, tersedia %)',
      v_bank_name, v_total, v_cash USING ERRCODE = '23514';
  END IF;

  -- Loop tiap owner bersaldo > 0 → tarik penuh via RPC teruji
  FOR v_owner IN
    SELECT id FROM users WHERE role = 'owner' AND is_active = true ORDER BY full_name
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_balance
      FROM owner_earnings WHERE owner_user_id = v_owner.id;
    IF v_balance > 0 THEN
      PERFORM record_owner_withdrawal(
        v_owner.id, v_balance, p_bank_account_id,
        p_method, p_account, p_reference, p_description, p_actor
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('owners', v_count, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION record_all_owner_withdrawals TO authenticated, service_role;

COMMENT ON FUNCTION record_all_owner_withdrawals IS
  'Ambil bagi hasil semua owner sekaligus (1 transaksi, all-or-nothing). Loop record_owner_withdrawal per owner bersaldo>0; cek super_admin + rekening aktif + guard kas tak minus.';
