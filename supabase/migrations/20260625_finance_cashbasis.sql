-- 20260625_finance_cashbasis.sql
-- ============================================================================
-- FASE 1 — Revenue cash-basis + Hutang Crew. Membuat GL jadi cerminan kas riil.
-- ============================================================================
-- Sebelumnya: pembayaran klien TIDAK masuk GL; settlement membukukan kas
-- sintetis (revenue − opex) + revenue di tanggal event. Akibatnya Kas/Bank di
-- GL tidak bisa dicocokkan ke rekening bank, dan fee crew dianggap lunas tunai.
--
-- Sekarang (cash-basis):
--   • Bayar DP/pelunasan  → Dr Kas/Bank (coa rekening) / Cr 4-100 Pendapatan.
--   • Settlement          → TIDAK lagi booking pendapatan & kas sintetis.
--       Dr HPP 5-1xx / Cr Persediaan 1-2xx        (pengakuan COGS)
--       Dr Beban OpEx 5-2xx / Cr 2-100 Hutang Crew (akrual biaya operasional)
--       Dr 3-200 Laba Ditahan / Cr 2-2xx, 2-300    (alokasi sinking & owner)
--   • Bayar fee crew      → Dr 2-100 / Cr Kas (lewat kategori Catat "Bayar fee crew").
--
-- Idempotent (CREATE OR REPLACE). Tidak menghapus data.

-- ============================================================================
-- 1. RPC record_payment_je — insert pembayaran + jurnal, ATOMIK
-- ============================================================================
CREATE OR REPLACE FUNCTION record_payment_je(
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
  v_pay_ref     text;
  v_je_ref      text;
  v_payment_id  uuid;
  v_je_id       uuid;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_actor;
  IF v_role IS NULL OR v_role NOT IN ('owner','super_admin') THEN
    RAISE EXCEPTION 'Forbidden: actor bukan owner/super_admin' USING ERRCODE = '42501';
  END IF;

  SELECT coa_code INTO v_bank_coa FROM bank_accounts WHERE id = p_bank_account_id;
  IF v_bank_coa IS NULL THEN
    RAISE EXCEPTION 'Rekening bank tidak ditemukan / belum punya akun COA' USING ERRCODE = 'P0002';
  END IF;

  v_pay_ref := 'PAY-' || to_char(p_payment_date, 'YYYYMMDD') || '-'
               || LPAD((random() * 9999)::int::text, 4, '0');

  INSERT INTO payments (
    ref_id, event_id, amount, payment_date, bank_account_id,
    payment_type, proof_url, notes, recorded_by
  ) VALUES (
    v_pay_ref, p_event_id, p_amount, p_payment_date, p_bank_account_id,
    p_payment_type, p_proof_url, p_notes, p_actor
  ) RETURNING id INTO v_payment_id;

  -- Jurnal: Dr Kas/Bank / Cr 4-100 Pendapatan (cash-basis: revenue saat uang masuk)
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
    (v_je_id, '4-100', 0, p_amount, 'Pendapatan event', 1);

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION record_payment_je(uuid, bigint, date, uuid, text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION record_payment_je(uuid, bigint, date, uuid, text, text, text, uuid) TO authenticated;

-- ============================================================================
-- 2. RPC reverse_payment_je — tandai reversed + jurnal pembalik, ATOMIK
-- ============================================================================
CREATE OR REPLACE FUNCTION reverse_payment_je(
  p_payment_id uuid,
  p_actor      uuid,
  p_reason     text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role     text;
  v_pay      RECORD;
  v_bank_coa text;
  v_old_je   RECORD;
  v_rev_id   uuid;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_actor;
  IF v_role IS NULL OR v_role NOT IN ('owner','super_admin') THEN
    RAISE EXCEPTION 'Forbidden: actor bukan owner/super_admin' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pay FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pembayaran tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF v_pay.is_reversed THEN RAISE EXCEPTION 'Pembayaran sudah di-reverse' USING ERRCODE = '42P01'; END IF;

  SELECT coa_code INTO v_bank_coa FROM bank_accounts WHERE id = v_pay.bank_account_id;

  UPDATE payments
  SET is_reversed = true, reversed_at = now(), reversed_by = p_actor, reversal_reason = p_reason
  WHERE id = p_payment_id;

  -- Jurnal pembalik (Dr 4-100 / Cr Kas) untuk JE pembayaran asli, jika ada.
  SELECT * INTO v_old_je FROM journal_entries
  WHERE source_type = 'payment' AND source_id = p_payment_id AND is_reversed = false
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    INSERT INTO journal_entries (
      ref_id, entry_date, entry_type, description,
      source_type, source_id, source_event_id, total_amount, created_by
    ) VALUES (
      generate_journal_reference(CURRENT_DATE), CURRENT_DATE, 'reversal',
      'REVERSAL pembayaran: ' || p_reason,
      'payment_reversal', p_payment_id, v_pay.event_id, v_old_je.total_amount, p_actor
    ) RETURNING id INTO v_rev_id;

    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    SELECT v_rev_id, account_code, credit_amount, debit_amount,
           'REVERSAL: ' || COALESCE(description, ''), line_order
    FROM journal_lines WHERE entry_id = v_old_je.id;

    UPDATE journal_entries
    SET is_reversed = true, reversed_by_entry_id = v_rev_id, reversed_at = now()
    WHERE id = v_old_je.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION reverse_payment_je(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION reverse_payment_je(uuid, uuid, text) TO authenticated;

-- ============================================================================
-- 3. _create_settlement_journal — cash-basis (tanpa revenue & kas sintetis)
-- ============================================================================
-- Dr HPP 5-1xx / Cr Persediaan 1-2xx ; Dr OpEx 5-2xx / Cr 2-100 Hutang Crew ;
-- Dr 3-200 / Cr 2-2xx (sinking) ; Dr 3-200 / Cr 2-300 (owner pool).
-- Pendapatan TIDAK dibukukan di sini (sudah saat pembayaran). Tidak menyentuh kas.
CREATE OR REPLACE FUNCTION _create_settlement_journal(
  p_settlement_id UUID,
  p_event_id UUID,
  p_hpp JSONB,
  p_opex JSONB,
  p_revenue_net BIGINT,       -- diterima utk kompat tanda tangan; TIDAK dibukukan
  p_sinking_total BIGINT,
  p_owner_pool_total BIGINT,
  p_operating_cash BIGINT,    -- UNUSED
  p_actor_id UUID,
  p_entry_date DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_entry_id   UUID;
  v_ref_id     TEXT;
  v_total      BIGINT;
  v_line_ord   INTEGER := 0;
  v_hpp_total  BIGINT;
  v_opex_total BIGINT;
  v_fund       RECORD;
BEGIN
  v_ref_id := generate_journal_reference(p_entry_date);

  v_hpp_total :=
      COALESCE((p_hpp->>'mediaset')::BIGINT, 0)
    + COALESCE((p_hpp->>'sleeve')::BIGINT, 0)
    + COALESCE((p_hpp->>'flashdisk')::BIGINT, 0)
    + COALESCE((p_hpp->>'pouch')::BIGINT, 0)
    + COALESCE((p_hpp->>'photomagnet')::BIGINT, 0)
    + COALESCE((p_hpp->>'keychain')::BIGINT, 0)
    + COALESCE((p_hpp->>'bonus')::BIGINT, 0)
    + COALESCE((p_hpp->>'other')::BIGINT, 0);

  v_opex_total :=
      COALESCE((p_opex->>'fee_lead')::BIGINT, 0)
    + COALESCE((p_opex->>'fee_asisten')::BIGINT, 0)
    + COALESCE((p_opex->>'fee_crew_c')::BIGINT, 0)
    + COALESCE((p_opex->>'fee_extra')::BIGINT, 0)
    + COALESCE((p_opex->>'transport_bbm')::BIGINT, 0)
    + COALESCE((p_opex->>'sewa_alat')::BIGINT, 0)
    + COALESCE((p_opex->>'perawatan')::BIGINT, 0)
    + COALESCE((p_opex->>'konsumsi')::BIGINT, 0)
    + COALESCE((p_opex->>'komisi_vendor')::BIGINT, 0)
    + COALESCE((p_opex->>'komisi_relasi')::BIGINT, 0)
    + COALESCE((p_opex->>'komisi_sales_direct')::BIGINT, 0)
    + COALESCE((p_opex->>'platform_fee')::BIGINT, 0);

  v_total := v_hpp_total + v_opex_total + p_sinking_total + p_owner_pool_total;

  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description,
    source_type, source_id, source_event_id, total_amount, created_by
  ) VALUES (
    v_ref_id, p_entry_date, 'expense',
    'Settlement event ' || p_event_id::TEXT || ' (biaya & alokasi)',
    'settlement', p_settlement_id, p_event_id, v_total, p_actor_id
  ) RETURNING id INTO v_entry_id;

  -- ===== DEBIT: HPP (beban) =====
  IF COALESCE((p_hpp->>'mediaset')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-100', (p_hpp->>'mediaset')::BIGINT, 'HPP Mediaset', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'sleeve')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-101', (p_hpp->>'sleeve')::BIGINT, 'HPP Sleeve', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'flashdisk')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-102', (p_hpp->>'flashdisk')::BIGINT, 'HPP Flashdisk', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'pouch')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-103', (p_hpp->>'pouch')::BIGINT, 'HPP Pouch', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'photomagnet')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-104', (p_hpp->>'photomagnet')::BIGINT, 'HPP Photomagnet', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'keychain')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-105', (p_hpp->>'keychain')::BIGINT, 'HPP Keychain', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'bonus')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-411', (p_hpp->>'bonus')::BIGINT, 'Cost bonus/freebie klien', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'other')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-109', (p_hpp->>'other')::BIGINT, 'HPP Lainnya', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== DEBIT: OpEx (beban) =====
  IF COALESCE((p_opex->>'fee_lead')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-201', (p_opex->>'fee_lead')::BIGINT, 'Fee Lead', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_asisten')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-202', (p_opex->>'fee_asisten')::BIGINT, 'Fee Asisten', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_crew_c')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-203', (p_opex->>'fee_crew_c')::BIGINT, 'Fee Crew C', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_extra')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-204', (p_opex->>'fee_extra')::BIGINT, 'Fee Extra / Bonus crew', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'transport_bbm')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-210', (p_opex->>'transport_bbm')::BIGINT, 'Transport & BBM', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'sewa_alat')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-220', (p_opex->>'sewa_alat')::BIGINT, 'Sewa alat', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'perawatan')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-230', (p_opex->>'perawatan')::BIGINT, 'Perawatan alat', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'konsumsi')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-240', (p_opex->>'konsumsi')::BIGINT, 'Konsumsi', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_vendor')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-300', (p_opex->>'komisi_vendor')::BIGINT, 'Komisi vendor', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_relasi')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-301', (p_opex->>'komisi_relasi')::BIGINT, 'Komisi relasi/sales', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_sales_direct')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-301', (p_opex->>'komisi_sales_direct')::BIGINT, 'Komisi sales direct', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'platform_fee')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-400', (p_opex->>'platform_fee')::BIGINT, 'Platform fee', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== DEBIT: alokasi laba ditahan =====
  IF p_sinking_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '3-200', p_sinking_total, 'Alokasi Laba Ditahan → Sinking Funds', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF p_owner_pool_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '3-200', p_owner_pool_total, 'Alokasi Laba Ditahan → Owner Pool', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: persediaan (lawan HPP) =====
  IF COALESCE((p_hpp->>'mediaset')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-200', (p_hpp->>'mediaset')::BIGINT, 'Kurang persediaan: Media Set', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'sleeve')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-201', (p_hpp->>'sleeve')::BIGINT, 'Kurang persediaan: Sleeve', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'flashdisk')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-202', (p_hpp->>'flashdisk')::BIGINT, 'Kurang persediaan: Flashdisk', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'pouch')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-203', (p_hpp->>'pouch')::BIGINT, 'Kurang persediaan: Pouch', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'photomagnet')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-204', (p_hpp->>'photomagnet')::BIGINT, 'Kurang persediaan: Photomagnet', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'keychain')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-205', (p_hpp->>'keychain')::BIGINT, 'Kurang persediaan: Keychain', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'bonus')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-209', (p_hpp->>'bonus')::BIGINT, 'Kurang persediaan: Bonus', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'other')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-209', (p_hpp->>'other')::BIGINT, 'Kurang persediaan: Lainnya', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: Hutang Crew (lawan OpEx) =====
  IF v_opex_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-100', v_opex_total, 'Hutang Crew (biaya operasional event, dibayar nanti)', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: sinking & owner pool =====
  FOR v_fund IN
    SELECT sf.code, sfm.amount
    FROM sinking_fund_movements sfm
    JOIN sinking_funds sf ON sf.id = sfm.fund_id
    WHERE sfm.source_settlement_id = p_settlement_id AND sfm.movement_type = 'deposit'
  LOOP
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id,
      CASE v_fund.code
        WHEN 'equipment' THEN '2-200' WHEN 'maintenance' THEN '2-201'
        WHEN 'crew_reserve' THEN '2-202' WHEN 'emergency' THEN '2-203' ELSE '2-200' END,
      v_fund.amount, 'Sinking: ' || v_fund.code, v_line_ord);
    v_line_ord := v_line_ord+1;
  END LOOP;

  IF p_owner_pool_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-300', p_owner_pool_total, 'Owner pool liability', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION _create_settlement_journal IS
  'Settlement journal cash-basis: HPP→persediaan, OpEx→Hutang Crew(2-100), alokasi sinking/owner dari 3-200. Pendapatan & kas TIDAK dibukukan di sini (revenue diakui saat pembayaran).';
