-- 20260630_settlement_journal_human_desc.sql
-- Keterangan jurnal settlement pakai bahasa manusia (banyak owner gaptek):
--   • Judul JE: "Settlement event <uuid> (biaya & alokasi)" → "Biaya & alokasi
--     event — <nama klien>". UUID dibuang.
--   • Baris robot di-Indonesiakan: Hutang Crew, sinking (Alat/Perawatan/…),
--     owner pool, alokasi laba.
-- Body fungsi identik dgn 20260625; HANYA string keterangan + lookup nama klien
-- yang berubah. Plus backfill JE settlement yang sudah ada biar langsung kebaca.

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
  v_client     TEXT;
BEGIN
  v_ref_id := generate_journal_reference(p_entry_date);

  SELECT NULLIF(TRIM(client_name), '') INTO v_client FROM events WHERE id = p_event_id;

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
    'Biaya & alokasi event — ' || COALESCE(v_client, 'tanpa nama klien'),
    'settlement', p_settlement_id, p_event_id, v_total, p_actor_id
  ) RETURNING id INTO v_entry_id;

  -- ===== DEBIT: HPP (beban) =====
  IF COALESCE((p_hpp->>'mediaset')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-100', (p_hpp->>'mediaset')::BIGINT, 'Biaya bahan: Mediaset', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'sleeve')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-101', (p_hpp->>'sleeve')::BIGINT, 'Biaya bahan: Sleeve', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'flashdisk')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-102', (p_hpp->>'flashdisk')::BIGINT, 'Biaya bahan: Flashdisk', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'pouch')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-103', (p_hpp->>'pouch')::BIGINT, 'Biaya bahan: Pouch', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'photomagnet')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-104', (p_hpp->>'photomagnet')::BIGINT, 'Biaya bahan: Photomagnet', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'keychain')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-105', (p_hpp->>'keychain')::BIGINT, 'Biaya bahan: Keychain', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'bonus')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-411', (p_hpp->>'bonus')::BIGINT, 'Biaya bonus/gratisan untuk klien', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'other')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-109', (p_hpp->>'other')::BIGINT, 'Biaya bahan: Lainnya', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== DEBIT: OpEx (beban) =====
  IF COALESCE((p_opex->>'fee_lead')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-201', (p_opex->>'fee_lead')::BIGINT, 'Fee crew (Lead)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_asisten')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-202', (p_opex->>'fee_asisten')::BIGINT, 'Fee crew (Asisten)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_crew_c')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-203', (p_opex->>'fee_crew_c')::BIGINT, 'Fee crew (Crew)', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'fee_extra')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-204', (p_opex->>'fee_extra')::BIGINT, 'Bonus/reimbursement crew', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'transport_bbm')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-210', (p_opex->>'transport_bbm')::BIGINT, 'Transport & bensin', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'sewa_alat')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-220', (p_opex->>'sewa_alat')::BIGINT, 'Sewa alat', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'perawatan')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-230', (p_opex->>'perawatan')::BIGINT, 'Perawatan alat', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'konsumsi')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-240', (p_opex->>'konsumsi')::BIGINT, 'Konsumsi event', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_vendor')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-300', (p_opex->>'komisi_vendor')::BIGINT, 'Komisi vendor', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_relasi')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-301', (p_opex->>'komisi_relasi')::BIGINT, 'Komisi relasi/sales', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'komisi_sales_direct')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-301', (p_opex->>'komisi_sales_direct')::BIGINT, 'Komisi sales langsung', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_opex->>'platform_fee')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-400', (p_opex->>'platform_fee')::BIGINT, 'Biaya platform', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== DEBIT: alokasi laba ditahan =====
  IF p_sinking_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '3-200', p_sinking_total, 'Sisihkan laba untuk dana cadangan', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF p_owner_pool_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '3-200', p_owner_pool_total, 'Sisihkan laba untuk bagi hasil owner', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: persediaan (lawan HPP) =====
  IF COALESCE((p_hpp->>'mediaset')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-200', (p_hpp->>'mediaset')::BIGINT, 'Stok berkurang: Media Set', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'sleeve')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-201', (p_hpp->>'sleeve')::BIGINT, 'Stok berkurang: Sleeve', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'flashdisk')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-202', (p_hpp->>'flashdisk')::BIGINT, 'Stok berkurang: Flashdisk', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'pouch')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-203', (p_hpp->>'pouch')::BIGINT, 'Stok berkurang: Pouch', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'photomagnet')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-204', (p_hpp->>'photomagnet')::BIGINT, 'Stok berkurang: Photomagnet', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'keychain')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-205', (p_hpp->>'keychain')::BIGINT, 'Stok berkurang: Keychain', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'bonus')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-209', (p_hpp->>'bonus')::BIGINT, 'Stok berkurang: Bonus', v_line_ord); v_line_ord := v_line_ord+1; END IF;
  IF COALESCE((p_hpp->>'other')::BIGINT,0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-209', (p_hpp->>'other')::BIGINT, 'Stok berkurang: Lainnya', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  -- ===== CREDIT: Hutang Crew (lawan OpEx) =====
  IF v_opex_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-100', v_opex_total, 'Utang ke crew (fee + reimbursement, dibayar saat transfer)', v_line_ord); v_line_ord := v_line_ord+1; END IF;

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
      v_fund.amount,
      'Dana cadangan: ' || CASE v_fund.code
        WHEN 'equipment' THEN 'Alat' WHEN 'maintenance' THEN 'Perawatan'
        WHEN 'crew_reserve' THEN 'Cadangan crew' WHEN 'emergency' THEN 'Darurat'
        ELSE v_fund.code END,
      v_line_ord);
    v_line_ord := v_line_ord+1;
  END LOOP;

  IF p_owner_pool_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-300', p_owner_pool_total, 'Utang bagi hasil ke owner', v_line_ord); v_line_ord := v_line_ord+1; END IF;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION _create_settlement_journal IS
  'Settlement journal cash-basis (keterangan bahasa manusia). HPP→persediaan, OpEx→Hutang Crew(2-100), alokasi sinking/owner dari 3-200. Pendapatan & kas TIDAK dibukukan di sini (revenue diakui saat pembayaran).';

-- ============================================================================
-- Backfill JE settlement yang sudah ada → judul + baris robot jadi bahasa manusia
-- ============================================================================
UPDATE journal_entries je
SET description = 'Biaya & alokasi event — ' || COALESCE(NULLIF(TRIM(e.client_name), ''), 'tanpa nama klien')
FROM events e
WHERE je.source_event_id = e.id
  AND je.source_type = 'settlement'
  AND je.description LIKE 'Settlement event %';

-- Baris yang paling "robot" di JE settlement lama
UPDATE journal_lines jl SET description = 'Utang ke crew (fee + reimbursement, dibayar saat transfer)'
FROM journal_entries je WHERE jl.entry_id = je.id AND je.source_type = 'settlement'
  AND jl.account_code = '2-100' AND jl.description = 'Hutang Crew (biaya operasional event, dibayar nanti)';
UPDATE journal_lines jl SET description = 'Utang bagi hasil ke owner'
FROM journal_entries je WHERE jl.entry_id = je.id AND je.source_type = 'settlement'
  AND jl.account_code = '2-300' AND jl.description = 'Owner pool liability';
UPDATE journal_lines jl SET description = 'Sisihkan laba untuk dana cadangan'
FROM journal_entries je WHERE jl.entry_id = je.id AND je.source_type = 'settlement'
  AND jl.account_code = '3-200' AND jl.description = 'Alokasi Laba Ditahan → Sinking Funds';
UPDATE journal_lines jl SET description = 'Sisihkan laba untuk bagi hasil owner'
FROM journal_entries je WHERE jl.entry_id = je.id AND je.source_type = 'settlement'
  AND jl.account_code = '3-200' AND jl.description = 'Alokasi Laba Ditahan → Owner Pool';
UPDATE journal_lines jl
SET description = 'Dana cadangan: ' || CASE
  WHEN jl.description = 'Sinking: equipment' THEN 'Alat'
  WHEN jl.description = 'Sinking: maintenance' THEN 'Perawatan'
  WHEN jl.description = 'Sinking: crew_reserve' THEN 'Cadangan crew'
  WHEN jl.description = 'Sinking: emergency' THEN 'Darurat'
  ELSE SUBSTRING(jl.description FROM 'Sinking: (.*)') END
FROM journal_entries je WHERE jl.entry_id = je.id AND je.source_type = 'settlement'
  AND jl.description LIKE 'Sinking: %';
