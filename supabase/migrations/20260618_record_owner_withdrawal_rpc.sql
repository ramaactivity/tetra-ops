-- 20260618_record_owner_withdrawal_rpc.sql
-- F5: jadikan owner withdrawal ATOMIK + bebas race.
--
-- Sebelumnya recordOwnerWithdrawal (TS) menghitung saldo lalu insert jurnal &
-- owner_earnings di 3 statement terpisah: (a) TOCTOU — 2 withdrawal barengan
-- bisa dua-duanya lolos cek saldo; (b) crash di antara insert jurnal & earnings
-- bikin GL ≠ sub-ledger (manual rollback tak menutup crash). RPC ini bungkus
-- semuanya dalam 1 transaksi + lock baris owner (FOR UPDATE) sbg titik
-- serialisasi → withdrawal kedua menunggu & melihat saldo terbaru.
--
-- Konvensi jurnal identik dgn flow TS lama: Dr 2-300 Hutang Bagi Hasil Owner /
-- Cr kas-bank. Saldo = SUM(amount) owner_earnings (earning positif, withdrawal/
-- adjustment negatif) — sama dgn perhitungan UI.

CREATE OR REPLACE FUNCTION record_owner_withdrawal(
  p_owner_user_id  UUID,
  p_amount         BIGINT,
  p_bank_account_id UUID,
  p_method         TEXT,
  p_account        TEXT,
  p_reference      TEXT,
  p_description    TEXT,
  p_actor          UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role  TEXT;
  v_target_role TEXT;
  v_balance     BIGINT;
  v_bank_coa    TEXT;
  v_bank_name   TEXT;
  v_bank_active BOOLEAN;
  v_ref         TEXT;
  v_entry_id    UUID;
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
  SELECT role INTO v_target_role FROM users WHERE id = p_owner_user_id FOR UPDATE;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Owner tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  IF v_target_role NOT IN ('super_admin', 'owner') THEN
    RAISE EXCEPTION 'Target bukan super_admin / owner' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM owner_earnings WHERE owner_user_id = p_owner_user_id;

  IF p_amount > v_balance THEN
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

  v_ref := generate_journal_reference(CURRENT_DATE);
  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description,
    source_type, source_id, total_amount, created_by
  ) VALUES (
    v_ref, CURRENT_DATE, 'asset_out',
    'Withdrawal owner pool — ' || COALESCE(p_description, ''),
    'owner_withdrawal', p_owner_user_id, p_amount, p_actor
  ) RETURNING id INTO v_entry_id;

  INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
  VALUES
    (v_entry_id, '2-300',     p_amount, 0, 'Bagi hasil owner dibayar', 1),
    (v_entry_id, v_bank_coa,  0, p_amount, 'Kas keluar (' || v_bank_name || ')', 2);

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
$$;

GRANT EXECUTE ON FUNCTION record_owner_withdrawal TO authenticated, service_role;

COMMENT ON FUNCTION record_owner_withdrawal IS
  'F5: atomic owner withdrawal (lock owner row → cek saldo → jurnal Dr 2-300/Cr kas + owner_earnings, 1 transaksi). Ganti flow TS multi-statement yang race + non-atomik.';
