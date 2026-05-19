-- 20260520_settle_event_wrappers.sql
-- New atomic RPCs:
--   • settle_event(event_id, owner_user_id, overrides JSONB DEFAULT NULL) → JSONB
--   • reopen_settlement(event_id, owner_user_id, reason) → JSONB
--
-- Improvements over close_event_settlement (v4):
--   1. Auto-derive HPP/OpEx dari calculate_recap_hpp/calculate_recap_opex
--      → Fix bug HPP bonus key dropped (lihat AUDIT_REKAP_MODULE.md Section 7.1.1)
--   2. Stock sufficiency check sebelum deduct
--   3. INSERT journal_entries + journal_lines (double-entry GL)
--      → Fix gap "journal stubbed" (AUDIT Section 5.2)
--   4. Update crew_rekap.status='settled' + locked=true
--      → Eksplisit lock, bukan hanya de-facto via UNIQUE constraint
--   5. Single-call signature: hanya butuh event_id + owner_user_id (+ optional overrides)
--   6. Return JSONB dengan semua generated IDs (settlement_id, journal_entry_id, batch_id)
--
-- close_event_settlement (v4) TETAP EXIST untuk backward compat — TIDAK di-drop.
-- App code lama yang reference close_event_settlement tetap jalan; pakai settle_event
-- untuk flow baru.

-- ============================================================================
-- HELPER: validate stock sufficiency
-- ============================================================================

CREATE OR REPLACE FUNCTION _validate_recap_stock_sufficient(p_recap_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recap        RECORD;
  v_frame_size   frame_size;
  v_event_id     UUID;
  v_shortage     JSONB := '[]'::jsonb;
  v_row          RECORD;
  v_current      BIGINT;
  v_needed       NUMERIC;
BEGIN
  SELECT cr.*, e.frame_size AS event_frame_size, e.id AS ev_id
  INTO v_recap
  FROM crew_rekap cr JOIN events e ON e.id = cr.event_id
  WHERE cr.id = p_recap_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recap not found: %', p_recap_id; END IF;

  v_frame_size := COALESCE(v_recap.frame_size_snapshot, v_recap.event_frame_size);
  v_event_id := v_recap.ev_id;

  -- Loop mapped items
  FOR v_row IN
    SELECT rfm.rekap_field, rfm.qty_per_unit, rfm.item_id, i.sku, i.name,
      CASE rfm.rekap_field
        WHEN 'media_set_used'   THEN v_recap.media_set_used
        WHEN 'sleeve_used'      THEN v_recap.sleeve_used
        WHEN 'flashdisk_used'   THEN v_recap.flashdisk_used
        WHEN 'pouch_used'       THEN v_recap.pouch_used
        WHEN 'photomagnet_used' THEN v_recap.photomagnet_used
        WHEN 'keychain_used'    THEN v_recap.keychain_used
        ELSE 0
      END AS qty_consumed
    FROM rekap_field_mapping rfm
    JOIN inventory_items i ON i.id = rfm.item_id
    WHERE rfm.is_active = true
      AND (
        rfm.frame_size = v_frame_size::TEXT
        OR (rfm.frame_size = '' AND NOT EXISTS (
              SELECT 1 FROM rekap_field_mapping rfm2
              WHERE rfm2.rekap_field = rfm.rekap_field
                AND rfm2.frame_size = v_frame_size::TEXT
                AND rfm2.is_active = true))
      )
  LOOP
    IF v_row.qty_consumed > 0 THEN
      v_needed := v_row.qty_consumed * v_row.qty_per_unit;
      v_current := get_current_stock(v_row.item_id);
      IF v_current < v_needed THEN
        v_shortage := v_shortage || jsonb_build_object(
          'item_id', v_row.item_id, 'sku', v_row.sku, 'name', v_row.name,
          'needed', v_needed, 'available', v_current,
          'shortage', v_needed - v_current
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sufficient', jsonb_array_length(v_shortage) = 0,
    'shortages', v_shortage
  );
END;
$$;

COMMENT ON FUNCTION _validate_recap_stock_sufficient IS
  'Check stock sufficiency untuk recap. Return JSONB {sufficient: bool, shortages: [{item, needed, available, shortage}]}';

-- ============================================================================
-- HELPER: build & insert journal entry for settlement
-- Returns journal_entry_id
-- ============================================================================

--
-- _create_settlement_journal v2 — fixed double-entry.
--
-- Double-entry logic:
--   DEBITS:
--     • Cash (1-100)        = revenue_net − opex_total (net cash inflow; HPP doesn't touch cash)
--     • HPP buckets (5-1xx) = per bucket value (expense recognition)
--     • OpEx buckets (5-2/3/4xx) = per bucket value (expense recognition)
--     • Retained Earnings (3-200) = sinking_total + owner_pool_total (book transfer to liabilities)
--
--   CREDITS:
--     • Revenue (4-100)     = revenue_net
--     • Inventory (1-200..1-205, 1-209) per HPP bucket = inventory asset reduction
--     • Sinking liabilities (2-200..2-203) per fund (split via query sinking_fund_movements)
--     • Owner Pool liability (2-300) = owner_pool_total
--
-- Balance: Dr = Cr = revenue_net + hpp_total + sinking_total + owner_pool_total.
-- p_operating_cash parameter kept for signature compat but unused (it was the bug source).
--

CREATE OR REPLACE FUNCTION _create_settlement_journal(
  p_settlement_id UUID,
  p_event_id UUID,
  p_hpp JSONB,
  p_opex JSONB,
  p_revenue_net BIGINT,
  p_sinking_total BIGINT,
  p_owner_pool_total BIGINT,
  p_operating_cash BIGINT,  -- UNUSED (kept for backward signature compat)
  p_actor_id UUID,
  p_entry_date DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_entry_id    UUID;
  v_ref_id      TEXT;
  v_total       BIGINT;
  v_line_ord    INTEGER := 0;
  v_hpp_total   BIGINT;
  v_opex_total  BIGINT;
  v_cash_net    BIGINT;
  v_fund        RECORD;

  -- Lambda helpers via inline IF: pakai mapping flat.

BEGIN
  v_ref_id := generate_journal_reference(p_entry_date);

  -- Compute totals
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
    -- Note: diskon_tambahan deliberately excluded (sudah di-baked into revenue_net = grand_total)

  v_cash_net := p_revenue_net - v_opex_total;
  v_total := p_revenue_net + v_hpp_total + p_sinking_total + p_owner_pool_total;

  -- Insert journal entry header
  INSERT INTO journal_entries (
    ref_id, entry_date, entry_type, description,
    source_type, source_id, source_event_id,
    total_amount, created_by
  ) VALUES (
    v_ref_id, p_entry_date, 'expense',
    'Settlement event ' || p_event_id::TEXT,
    'settlement', p_settlement_id, p_event_id,
    v_total, p_actor_id
  ) RETURNING id INTO v_entry_id;

  -- =================== DEBITS ===================

  -- 1. Cash (net inflow from event after OpEx paid; HPP doesn't affect cash)
  IF v_cash_net > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '1-100', v_cash_net, 'Net cash inflow (revenue − opex)', v_line_ord);
    v_line_ord := v_line_ord + 1;
  ELSIF v_cash_net < 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-100', -v_cash_net, 'Net cash outflow (opex > revenue)', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;

  -- 2. HPP expense recognition (per bucket)
  IF (p_hpp->>'mediaset')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-100', (p_hpp->>'mediaset')::BIGINT, 'HPP Mediaset', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'sleeve')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-101', (p_hpp->>'sleeve')::BIGINT, 'HPP Sleeve', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'flashdisk')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-102', (p_hpp->>'flashdisk')::BIGINT, 'HPP Flashdisk', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'pouch')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-103', (p_hpp->>'pouch')::BIGINT, 'HPP Pouch', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'photomagnet')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-104', (p_hpp->>'photomagnet')::BIGINT, 'HPP Photomagnet', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'keychain')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-105', (p_hpp->>'keychain')::BIGINT, 'HPP Keychain', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'bonus')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-411', (p_hpp->>'bonus')::BIGINT, 'Cost of bonus/freebie klien', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF COALESCE((p_hpp->>'other')::BIGINT, 0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-109', (p_hpp->>'other')::BIGINT, 'HPP Lainnya', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;

  -- 3. OpEx expense recognition (cash side already netted above)
  IF (p_opex->>'fee_lead')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-201', (p_opex->>'fee_lead')::BIGINT, 'Fee Lead', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'fee_asisten')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-202', (p_opex->>'fee_asisten')::BIGINT, 'Fee Asisten', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'fee_crew_c')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-203', (p_opex->>'fee_crew_c')::BIGINT, 'Fee Crew C', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'fee_extra')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-204', (p_opex->>'fee_extra')::BIGINT, 'Fee Extra / Bonus crew', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'transport_bbm')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-210', (p_opex->>'transport_bbm')::BIGINT, 'Transport & BBM', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'sewa_alat')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-220', (p_opex->>'sewa_alat')::BIGINT, 'Sewa alat', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'perawatan')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-230', (p_opex->>'perawatan')::BIGINT, 'Perawatan alat', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'konsumsi')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-240', (p_opex->>'konsumsi')::BIGINT, 'Konsumsi', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'komisi_vendor')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-300', (p_opex->>'komisi_vendor')::BIGINT, 'Komisi vendor', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'komisi_relasi')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-301', (p_opex->>'komisi_relasi')::BIGINT, 'Komisi relasi/sales', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'komisi_sales_direct')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-301', (p_opex->>'komisi_sales_direct')::BIGINT, 'Komisi sales direct', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_opex->>'platform_fee')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '5-400', (p_opex->>'platform_fee')::BIGINT, 'Platform fee', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  -- diskon_tambahan: NOT debited here. Diskon sudah dipotong dari grand_total → revenue_net,
  -- jadi double-counting kalau di-debit lagi.

  -- 4. Allocation transfers: Retained Earnings → Liabilities
  IF p_sinking_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '3-200', p_sinking_total, 'Transfer Retained Earnings → Sinking Funds', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF p_owner_pool_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, description, line_order)
    VALUES (v_entry_id, '3-200', p_owner_pool_total, 'Transfer Retained Earnings → Owner Pool', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;

  -- =================== CREDITS ===================

  -- 5. Revenue recognition
  IF p_revenue_net > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '4-100', p_revenue_net, 'Revenue dari event', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;

  -- 6. Inventory reduction (per HPP bucket → inventory asset COA)
  IF (p_hpp->>'mediaset')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-200', (p_hpp->>'mediaset')::BIGINT, 'Reduce inventory: Media Set', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'sleeve')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-201', (p_hpp->>'sleeve')::BIGINT, 'Reduce inventory: Sleeve', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'flashdisk')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-202', (p_hpp->>'flashdisk')::BIGINT, 'Reduce inventory: Flashdisk', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'pouch')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-203', (p_hpp->>'pouch')::BIGINT, 'Reduce inventory: Pouch', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'photomagnet')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-204', (p_hpp->>'photomagnet')::BIGINT, 'Reduce inventory: Photomagnet', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'keychain')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-205', (p_hpp->>'keychain')::BIGINT, 'Reduce inventory: Keychain', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF (p_hpp->>'bonus')::BIGINT > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-209', (p_hpp->>'bonus')::BIGINT, 'Reduce inventory: Bonus items', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;
  IF COALESCE((p_hpp->>'other')::BIGINT, 0) > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '1-209', (p_hpp->>'other')::BIGINT, 'Reduce inventory: Lainnya', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;

  -- 7. Sinking fund liabilities (split per fund — query from movements just inserted)
  FOR v_fund IN
    SELECT sf.code, sfm.amount
    FROM sinking_fund_movements sfm
    JOIN sinking_funds sf ON sf.id = sfm.fund_id
    WHERE sfm.source_settlement_id = p_settlement_id
      AND sfm.movement_type = 'deposit'
  LOOP
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (
      v_entry_id,
      CASE v_fund.code
        WHEN 'equipment'    THEN '2-200'
        WHEN 'maintenance'  THEN '2-201'
        WHEN 'crew_reserve' THEN '2-202'
        WHEN 'emergency'    THEN '2-203'
        ELSE '2-200'  -- fallback (unlikely)
      END,
      v_fund.amount,
      'Sinking liability: ' || v_fund.code,
      v_line_ord
    );
    v_line_ord := v_line_ord + 1;
  END LOOP;

  -- 8. Owner pool liability
  IF p_owner_pool_total > 0 THEN
    INSERT INTO journal_lines (entry_id, account_code, credit_amount, description, line_order)
    VALUES (v_entry_id, '2-300', p_owner_pool_total, 'Owner pool liability', v_line_ord);
    v_line_ord := v_line_ord + 1;
  END IF;

  RETURN v_entry_id;
END;
$$;

COMMENT ON FUNCTION _create_settlement_journal IS
  'Internal: create journal entry + lines for settlement. Called dari settle_event.';

-- ============================================================================
-- MAIN: settle_event(p_event_id, p_owner_user_id, p_overrides) → JSONB
-- ============================================================================

CREATE OR REPLACE FUNCTION settle_event(
  p_event_id UUID,
  p_owner_user_id UUID,
  p_overrides JSONB DEFAULT NULL  -- {hpp: {...}, opex: {...}, revenue_gross, discount_total}
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event           RECORD;
  v_recap           RECORD;
  v_settlement_id   UUID;
  v_batch_id        UUID;
  v_journal_id      UUID;

  v_hpp             JSONB;
  v_opex            JSONB;
  v_hpp_auto        JSONB;
  v_opex_auto       JSONB;
  v_was_override    BOOLEAN := false;

  v_revenue_gross   BIGINT;
  v_discount        BIGINT;
  v_revenue_net     BIGINT;
  v_hpp_total       BIGINT;
  v_opex_total      BIGINT;
  v_total_biaya     BIGINT;
  v_net_profit      BIGINT;
  v_margin          NUMERIC(5,2);
  v_is_loss         BOOLEAN;

  v_addon_total     BIGINT;

  v_stock_check     JSONB;
  v_actor_role      TEXT;
  v_owner_pool_pp   BIGINT;
  v_owner_count     INTEGER;
  v_owner_pool_tot  BIGINT;
  v_owner_id        UUID;
  v_owner_share     NUMERIC;
  v_dist_mode       TEXT;
  v_share_total     NUMERIC;

  v_fund            RECORD;
  v_alloc           BIGINT;
  v_sink_total      BIGINT := 0;
  v_sink_eq         BIGINT := 0;
  v_sink_mt         BIGINT := 0;
  v_sink_cr         BIGINT := 0;
  v_sink_em         BIGINT := 0;
  v_operating_cash  BIGINT;

  v_dline           RECORD;
  v_frame_size      frame_size;
BEGIN
  -- ------------------------------------------------------------------
  -- 1. Validate actor & event
  -- ------------------------------------------------------------------
  SELECT role INTO v_actor_role FROM users WHERE id = p_owner_user_id;
  IF v_actor_role NOT IN ('owner', 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden: actor % is not owner/super_admin (role=%)', p_owner_user_id, v_actor_role
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id USING ERRCODE = 'P0002';
  END IF;
  IF v_event.status NOT IN ('in_progress', 'awaiting_settlement') THEN
    RAISE EXCEPTION 'Event status must be in_progress or awaiting_settlement (got %)', v_event.status
      USING ERRCODE = '42P01';
  END IF;
  IF EXISTS (SELECT 1 FROM event_settlements WHERE event_id = p_event_id) THEN
    RAISE EXCEPTION 'Event % already settled', p_event_id USING ERRCODE = '23505';
  END IF;

  -- ------------------------------------------------------------------
  -- 2. Validate recap exists & approved
  -- ------------------------------------------------------------------
  SELECT * INTO v_recap FROM crew_rekap WHERE event_id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rekap belum di-submit untuk event %', p_event_id USING ERRCODE = 'P0002';
  END IF;
  IF v_recap.status NOT IN ('reviewed', 'settled') THEN
    RAISE EXCEPTION 'Rekap belum di-review/approve. Status saat ini: %', v_recap.status USING ERRCODE = '42P01';
  END IF;

  -- ------------------------------------------------------------------
  -- 3. Stock sufficiency check
  -- ------------------------------------------------------------------
  v_stock_check := _validate_recap_stock_sufficient(v_recap.id);
  IF NOT (v_stock_check->>'sufficient')::BOOLEAN THEN
    RAISE EXCEPTION 'Stock tidak cukup untuk settle: %', v_stock_check->'shortages' USING ERRCODE = '23514';
  END IF;

  -- ------------------------------------------------------------------
  -- 4. Compute HPP & OpEx (auto-derived; overrides applied if provided)
  -- ------------------------------------------------------------------
  v_hpp_auto  := calculate_recap_hpp(v_recap.id);
  v_opex_auto := calculate_recap_opex(v_recap.id);

  IF p_overrides IS NOT NULL AND p_overrides ? 'hpp' THEN
    v_hpp := p_overrides->'hpp';
    v_was_override := true;
  ELSE
    v_hpp := v_hpp_auto;
  END IF;

  IF p_overrides IS NOT NULL AND p_overrides ? 'opex' THEN
    v_opex := p_overrides->'opex';
  ELSE
    -- Re-shape calculate_recap_opex output to match event_settlements OpEx schema (13 keys)
    v_opex := jsonb_build_object(
      'fee_lead',            COALESCE((v_opex_auto->>'fee_lead')::BIGINT, 0),
      'fee_asisten',         COALESCE((v_opex_auto->>'fee_asisten')::BIGINT, 0),
      'fee_crew_c',          COALESCE((v_opex_auto->>'fee_crew_c')::BIGINT, 0),
      'fee_extra',           COALESCE((v_opex_auto->>'fee_extra')::BIGINT, 0)
                              + COALESCE((v_opex_auto->>'reimbursement')::BIGINT, 0),
      'transport_bbm',       COALESCE((v_opex_auto->>'transport')::BIGINT, 0)
                              + COALESCE((v_opex_auto->>'bensin')::BIGINT, 0)
                              + COALESCE((v_opex_auto->>'toll')::BIGINT, 0)
                              + COALESCE((v_opex_auto->>'parking')::BIGINT, 0),
      'sewa_alat',           0,
      'perawatan',           0,
      'konsumsi',            COALESCE((v_opex_auto->>'konsumsi')::BIGINT, 0)
                              + COALESCE((v_opex_auto->>'misc')::BIGINT, 0),
      'komisi_vendor',       0,
      'komisi_relasi',       0,
      'komisi_sales_direct', 0,
      'platform_fee',        0,
      'diskon_tambahan',     0
    );
  END IF;

  -- ------------------------------------------------------------------
  -- 5. Revenue: pakai events.grand_total sebagai canonical revenue_net.
  --    revenue_gross = base/custom_package_price + addons_total (sebelum diskon).
  --    discount = events.discount_amount.
  --    Caller bisa override via p_overrides.revenue_gross / .discount_total.
  -- ------------------------------------------------------------------
  v_addon_total := COALESCE(v_event.addons_total, 0)::BIGINT;

  IF p_overrides IS NOT NULL AND p_overrides ? 'revenue_gross' THEN
    v_revenue_gross := (p_overrides->>'revenue_gross')::BIGINT;
  ELSE
    v_revenue_gross :=
      COALESCE(v_event.custom_package_price, v_event.base_price, 0)::BIGINT
      + v_addon_total;
  END IF;

  IF p_overrides IS NOT NULL AND p_overrides ? 'discount_total' THEN
    v_discount := (p_overrides->>'discount_total')::BIGINT;
  ELSE
    v_discount := COALESCE(v_event.discount_amount, 0)::BIGINT;
  END IF;

  -- Prefer grand_total (canonical post-discount) kalau ada, else compute.
  v_revenue_net := COALESCE(
    NULLIF(v_event.grand_total, 0)::BIGINT,
    v_revenue_gross - v_discount
  );

  -- ------------------------------------------------------------------
  -- 6. Compute totals
  -- ------------------------------------------------------------------
  v_hpp_total :=
      COALESCE((v_hpp->>'mediaset')::BIGINT, 0)
    + COALESCE((v_hpp->>'sleeve')::BIGINT, 0)
    + COALESCE((v_hpp->>'flashdisk')::BIGINT, 0)
    + COALESCE((v_hpp->>'pouch')::BIGINT, 0)
    + COALESCE((v_hpp->>'photomagnet')::BIGINT, 0)
    + COALESCE((v_hpp->>'keychain')::BIGINT, 0)
    + COALESCE((v_hpp->>'bonus')::BIGINT, 0)
    + COALESCE((v_hpp->>'other')::BIGINT, 0);

  v_opex_total :=
      COALESCE((v_opex->>'fee_lead')::BIGINT, 0)
    + COALESCE((v_opex->>'fee_asisten')::BIGINT, 0)
    + COALESCE((v_opex->>'fee_crew_c')::BIGINT, 0)
    + COALESCE((v_opex->>'fee_extra')::BIGINT, 0)
    + COALESCE((v_opex->>'transport_bbm')::BIGINT, 0)
    + COALESCE((v_opex->>'sewa_alat')::BIGINT, 0)
    + COALESCE((v_opex->>'perawatan')::BIGINT, 0)
    + COALESCE((v_opex->>'konsumsi')::BIGINT, 0)
    + COALESCE((v_opex->>'komisi_vendor')::BIGINT, 0)
    + COALESCE((v_opex->>'komisi_relasi')::BIGINT, 0)
    + COALESCE((v_opex->>'komisi_sales_direct')::BIGINT, 0)
    + COALESCE((v_opex->>'platform_fee')::BIGINT, 0)
    + COALESCE((v_opex->>'diskon_tambahan')::BIGINT, 0);

  v_total_biaya := v_hpp_total + v_opex_total;
  v_net_profit  := v_revenue_net - v_total_biaya;
  v_is_loss     := v_net_profit <= 0;
  v_margin := CASE WHEN v_revenue_net > 0
    THEN ROUND((v_net_profit::NUMERIC / v_revenue_net::NUMERIC) * 100, 2)
    ELSE 0 END;

  -- ------------------------------------------------------------------
  -- 7. Sinking fund allocation
  -- ------------------------------------------------------------------
  IF NOT v_is_loss THEN
    FOR v_fund IN SELECT * FROM sinking_funds WHERE is_active = true ORDER BY display_order LOOP
      IF v_fund.allocation_type = 'percentage' THEN
        v_alloc := FLOOR(v_net_profit * v_fund.allocation_value / 100)::BIGINT;
      ELSE  -- 'flat'
        v_alloc := v_fund.allocation_value::BIGINT;
      END IF;
      IF v_alloc > 0 THEN
        v_sink_total := v_sink_total + v_alloc;
        CASE v_fund.code
          WHEN 'equipment'     THEN v_sink_eq := v_alloc;
          WHEN 'maintenance'   THEN v_sink_mt := v_alloc;
          WHEN 'crew_reserve'  THEN v_sink_cr := v_alloc;
          WHEN 'emergency'     THEN v_sink_em := v_alloc;
          ELSE NULL;
        END CASE;
      END IF;
    END LOOP;
  END IF;

  -- ------------------------------------------------------------------
  -- 8. Owner pool allocation
  -- ------------------------------------------------------------------
  SELECT COALESCE(value::TEXT::BIGINT, 50000)
  INTO v_owner_pool_pp
  FROM system_config WHERE key = 'settlement.owner_pool_per_person';
  IF v_owner_pool_pp IS NULL THEN v_owner_pool_pp := 50000; END IF;

  SELECT COALESCE(value::TEXT, 'equal')
  INTO v_dist_mode
  FROM system_config WHERE key = 'settlement.owner_pool_distribution_mode';
  v_dist_mode := COALESCE(v_dist_mode, 'equal');

  SELECT COUNT(*) INTO v_owner_count FROM users WHERE role IN ('owner','super_admin') AND is_active = true;
  v_owner_pool_tot := CASE WHEN v_is_loss THEN 0 ELSE v_owner_count * v_owner_pool_pp END;

  -- ------------------------------------------------------------------
  -- 9. Operating cash (remainder)
  -- ------------------------------------------------------------------
  v_operating_cash := GREATEST(v_net_profit - v_sink_total - v_owner_pool_tot, 0);

  -- ------------------------------------------------------------------
  -- 10. INSERT event_settlements
  -- ------------------------------------------------------------------
  INSERT INTO event_settlements (
    event_id, revenue_gross, discount_total, revenue_net,
    hpp_mediaset, hpp_sleeve, hpp_flashdisk, hpp_pouch,
    hpp_photomagnet, hpp_keychain, hpp_bonus, hpp_other, hpp_total,
    fee_lead, fee_asisten, fee_crew_c, fee_extra,
    transport_bbm, sewa_alat, perawatan, konsumsi,
    komisi_vendor, komisi_relasi, komisi_sales_direct,
    platform_fee, diskon_tambahan, opex_total,
    total_biaya, net_profit, margin_percentage, is_loss,
    sinking_equipment, sinking_maintenance, sinking_crew_reserve, sinking_emergency, sinking_total,
    owner_pool_total, owner_pool_per_person, operating_cash_kept,
    hpp_auto_snapshot, hpp_was_overridden,
    closed_by
  ) VALUES (
    p_event_id, v_revenue_gross, v_discount, v_revenue_net,
    COALESCE((v_hpp->>'mediaset')::BIGINT, 0),
    COALESCE((v_hpp->>'sleeve')::BIGINT, 0),
    COALESCE((v_hpp->>'flashdisk')::BIGINT, 0),
    COALESCE((v_hpp->>'pouch')::BIGINT, 0),
    COALESCE((v_hpp->>'photomagnet')::BIGINT, 0),
    COALESCE((v_hpp->>'keychain')::BIGINT, 0),
    COALESCE((v_hpp->>'bonus')::BIGINT, 0),
    COALESCE((v_hpp->>'other')::BIGINT, 0),
    v_hpp_total,
    COALESCE((v_opex->>'fee_lead')::BIGINT, 0),
    COALESCE((v_opex->>'fee_asisten')::BIGINT, 0),
    COALESCE((v_opex->>'fee_crew_c')::BIGINT, 0),
    COALESCE((v_opex->>'fee_extra')::BIGINT, 0),
    COALESCE((v_opex->>'transport_bbm')::BIGINT, 0),
    COALESCE((v_opex->>'sewa_alat')::BIGINT, 0),
    COALESCE((v_opex->>'perawatan')::BIGINT, 0),
    COALESCE((v_opex->>'konsumsi')::BIGINT, 0),
    COALESCE((v_opex->>'komisi_vendor')::BIGINT, 0),
    COALESCE((v_opex->>'komisi_relasi')::BIGINT, 0),
    COALESCE((v_opex->>'komisi_sales_direct')::BIGINT, 0),
    COALESCE((v_opex->>'platform_fee')::BIGINT, 0),
    COALESCE((v_opex->>'diskon_tambahan')::BIGINT, 0),
    v_opex_total,
    v_total_biaya, v_net_profit, v_margin, v_is_loss,
    v_sink_eq, v_sink_mt, v_sink_cr, v_sink_em, v_sink_total,
    v_owner_pool_tot, v_owner_pool_pp, v_operating_cash,
    v_hpp_auto, v_was_override,
    p_owner_user_id
  ) RETURNING id INTO v_settlement_id;

  -- ------------------------------------------------------------------
  -- 11. Stock deduction (batch)
  -- ------------------------------------------------------------------
  v_batch_id := gen_random_uuid();
  v_frame_size := COALESCE(v_recap.frame_size_snapshot, v_event.frame_size);

  FOR v_dline IN
    SELECT rfm.item_id, rfm.qty_per_unit,
      CASE rfm.rekap_field
        WHEN 'media_set_used'   THEN v_recap.media_set_used
        WHEN 'sleeve_used'      THEN v_recap.sleeve_used
        WHEN 'flashdisk_used'   THEN v_recap.flashdisk_used
        WHEN 'pouch_used'       THEN v_recap.pouch_used
        WHEN 'photomagnet_used' THEN v_recap.photomagnet_used
        WHEN 'keychain_used'    THEN v_recap.keychain_used
        ELSE 0
      END AS qty_consumed,
      i.purchase_price_avg
    FROM rekap_field_mapping rfm
    JOIN inventory_items i ON i.id = rfm.item_id
    WHERE rfm.is_active = true
      AND (
        rfm.frame_size = v_frame_size::TEXT
        OR (rfm.frame_size = '' AND NOT EXISTS (
              SELECT 1 FROM rekap_field_mapping rfm2
              WHERE rfm2.rekap_field = rfm.rekap_field
                AND rfm2.frame_size = v_frame_size::TEXT
                AND rfm2.is_active = true))
      )
  LOOP
    IF v_dline.qty_consumed > 0 THEN
      INSERT INTO stock_movements (
        ref_id, item_id, direction, quantity, unit_cost,
        source, source_id, source_description,
        performed_by, notes
      ) VALUES (
        'SM-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::TEXT, 1, 8),
        v_dline.item_id, 'out', (v_dline.qty_consumed * v_dline.qty_per_unit)::INTEGER, v_dline.purchase_price_avg,
        'settlement'::movement_source, p_event_id,
        'Settle event ' || v_event.project_id || ' (batch ' || v_batch_id || ')',
        p_owner_user_id, 'settle_event auto-deduct'
      );
    END IF;
  END LOOP;

  -- Bonus item deduction (event_bonuses → addon.inventory_item)
  INSERT INTO stock_movements (ref_id, item_id, direction, quantity, unit_cost, source, source_id, source_description, performed_by, notes)
  SELECT
    'SM-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::TEXT, 1, 8),
    a.inventory_item_id, 'out', eb.quantity::INTEGER, COALESCE(i.purchase_price_avg, 0),
    'settlement'::movement_source, p_event_id,
    'Bonus item: ' || a.name || ' (batch ' || v_batch_id || ')',
    p_owner_user_id, 'settle_event bonus deduct'
  FROM event_bonuses eb
  JOIN addons a ON a.id = eb.addon_id
  LEFT JOIN inventory_items i ON i.id = a.inventory_item_id
  WHERE eb.event_id = p_event_id AND a.inventory_item_id IS NOT NULL;

  -- ------------------------------------------------------------------
  -- 12. Sinking fund movements
  -- ------------------------------------------------------------------
  IF v_sink_total > 0 THEN
    FOR v_fund IN SELECT * FROM sinking_funds WHERE is_active = true LOOP
      IF v_fund.allocation_type = 'percentage' THEN
        v_alloc := FLOOR(v_net_profit * v_fund.allocation_value / 100)::BIGINT;
      ELSE
        v_alloc := v_fund.allocation_value::BIGINT;
      END IF;
      IF v_alloc > 0 THEN
        INSERT INTO sinking_fund_movements (
          fund_id, movement_type, amount,
          source_type, source_event_id, source_settlement_id,
          description, performed_by
        ) VALUES (
          v_fund.id, 'deposit', v_alloc,
          'settlement', p_event_id, v_settlement_id,
          'Auto-allocation from settle_event', p_owner_user_id
        );
      END IF;
    END LOOP;
  END IF;

  -- ------------------------------------------------------------------
  -- 13. Owner pool earnings
  -- ------------------------------------------------------------------
  IF v_owner_pool_tot > 0 THEN
    -- Validate share_pct for proportional mode
    IF v_dist_mode = 'proportional' THEN
      SELECT COALESCE(SUM(share_pct), 0) INTO v_share_total
      FROM users WHERE role IN ('owner','super_admin') AND is_active = true;
      IF ABS(v_share_total - 100) > 0.01 OR EXISTS (
        SELECT 1 FROM users WHERE role IN ('owner','super_admin') AND is_active = true AND share_pct IS NULL
      ) THEN
        v_dist_mode := 'equal';  -- fallback
        INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
        VALUES ('event_settlement', v_settlement_id, 'fallback',
                jsonb_build_object('reason', 'invalid share_pct; fallback to equal distribution'),
                p_owner_user_id);
      END IF;
    END IF;

    FOR v_owner_id, v_owner_share IN
      SELECT id, COALESCE(share_pct, 0) FROM users
      WHERE role IN ('owner','super_admin') AND is_active = true
    LOOP
      INSERT INTO owner_earnings (
        owner_user_id, earning_type, amount,
        source_event_id, source_settlement_id,
        description, performed_by
      ) VALUES (
        v_owner_id, 'profit_share',
        CASE WHEN v_dist_mode = 'proportional'
          THEN FLOOR(v_owner_pool_tot * v_owner_share / 100)::BIGINT
          ELSE v_owner_pool_pp
        END,
        p_event_id, v_settlement_id,
        'Auto-distribution from settle_event', p_owner_user_id
      );
    END LOOP;
  END IF;

  -- ------------------------------------------------------------------
  -- 14. Journal entry (double-entry GL) — fix gap "journal stubbed"
  -- ------------------------------------------------------------------
  v_journal_id := _create_settlement_journal(
    v_settlement_id, p_event_id, v_hpp, v_opex,
    v_revenue_net, v_sink_total, v_owner_pool_tot, v_operating_cash,
    p_owner_user_id, v_event.event_date
  );

  -- Link journal back to settlement
  UPDATE event_settlements SET journal_entry_id = v_journal_id WHERE id = v_settlement_id;

  -- ------------------------------------------------------------------
  -- 15. Lock event + recap
  -- ------------------------------------------------------------------
  UPDATE events SET status = 'completed', updated_at = NOW() WHERE id = p_event_id;
  UPDATE crew_rekap
  SET status = 'settled', locked = true, locked_at = NOW(), settled_at = NOW(),
      stock_committed_at = COALESCE(stock_committed_at, NOW()),
      stock_movement_batch_id = COALESCE(stock_movement_batch_id, v_batch_id)
  WHERE id = v_recap.id;

  -- ------------------------------------------------------------------
  -- 16. Audit log
  -- ------------------------------------------------------------------
  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES (
    'event_settlement', v_settlement_id, 'settle',
    jsonb_build_object(
      'after', jsonb_build_object(
        'event_id', p_event_id,
        'revenue_net', v_revenue_net,
        'net_profit', v_net_profit,
        'is_loss', v_is_loss,
        'sink_total', v_sink_total,
        'owner_pool_total', v_owner_pool_tot
      )
    ),
    p_owner_user_id
  );

  RETURN jsonb_build_object(
    'settlement_id',     v_settlement_id,
    'journal_entry_id',  v_journal_id,
    'stock_batch_id',    v_batch_id,
    'revenue_net',       v_revenue_net,
    'hpp_total',         v_hpp_total,
    'opex_total',        v_opex_total,
    'net_profit',        v_net_profit,
    'margin_pct',        v_margin,
    'is_loss',           v_is_loss,
    'sinking_total',     v_sink_total,
    'owner_pool_total',  v_owner_pool_tot,
    'operating_cash',    v_operating_cash
  );
END;
$$;

COMMENT ON FUNCTION settle_event IS
  'Atomic settle event. Auto-derives HPP/OpEx, validates stock, creates settlement+stock_movements+sinking+owner_earnings+journal_entries. Locks event+recap. Returns JSONB with all generated IDs.';

-- ============================================================================
-- REOPEN: reopen_settlement(p_event_id, p_actor_id, p_reason) → JSONB
-- ============================================================================

CREATE OR REPLACE FUNCTION reopen_settlement(
  p_event_id UUID,
  p_owner_user_id UUID,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement      RECORD;
  v_actor_role      TEXT;
  v_reversal_je_id  UUID;
  v_old_je          RECORD;
  v_line            RECORD;
  v_batch_id        UUID;
BEGIN
  -- Validate actor
  SELECT role INTO v_actor_role FROM users WHERE id = p_owner_user_id;
  IF v_actor_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: only super_admin can reopen settlement (actor role=%)', v_actor_role
      USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Reason wajib (minimal 5 karakter)' USING ERRCODE = '22023';
  END IF;

  -- Get settlement
  SELECT * INTO v_settlement FROM event_settlements WHERE event_id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement tidak ditemukan untuk event %', p_event_id USING ERRCODE = 'P0002';
  END IF;

  IF v_settlement.is_reopened = true THEN
    RAISE EXCEPTION 'Settlement % sudah pernah di-reopen', v_settlement.id USING ERRCODE = '42P01';
  END IF;

  -- ------------------------------------------------------------------
  -- 1. Reverse sinking fund movements
  -- ------------------------------------------------------------------
  INSERT INTO sinking_fund_movements (
    fund_id, movement_type, amount, source_type, source_event_id, source_settlement_id,
    description, performed_by
  )
  SELECT fund_id, 'withdrawal', amount, 'settlement', p_event_id, v_settlement.id,
         'REOPEN reverse: ' || p_reason, p_owner_user_id
  FROM sinking_fund_movements
  WHERE source_settlement_id = v_settlement.id AND movement_type = 'deposit';

  -- ------------------------------------------------------------------
  -- 2. Reverse owner earnings
  -- ------------------------------------------------------------------
  INSERT INTO owner_earnings (
    owner_user_id, earning_type, amount, source_event_id, source_settlement_id,
    description, performed_by
  )
  SELECT owner_user_id, 'adjustment', -amount, p_event_id, v_settlement.id,
         'REOPEN reverse: ' || p_reason, p_owner_user_id
  FROM owner_earnings
  WHERE source_settlement_id = v_settlement.id AND earning_type = 'profit_share';

  -- ------------------------------------------------------------------
  -- 3. Reverse stock movements (positive 'in' offsets)
  -- ------------------------------------------------------------------
  v_batch_id := gen_random_uuid();
  INSERT INTO stock_movements (
    ref_id, item_id, direction, quantity, unit_cost,
    source, source_id, source_description,
    performed_by, notes
  )
  SELECT
    'SM-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::TEXT, 1, 8),
    item_id, 'in', quantity, unit_cost,
    'settlement'::movement_source, p_event_id,
    'Reopen settlement (' || p_reason || ') batch ' || v_batch_id,
    p_owner_user_id, 'reopen_settlement auto-restore'
  FROM stock_movements
  WHERE source_id = p_event_id AND direction = 'out' AND source = 'settlement'::movement_source;

  -- ------------------------------------------------------------------
  -- 4. Reverse journal entries (create reversal entry)
  -- ------------------------------------------------------------------
  IF v_settlement.journal_entry_id IS NOT NULL THEN
    SELECT * INTO v_old_je FROM journal_entries WHERE id = v_settlement.journal_entry_id;

    INSERT INTO journal_entries (
      ref_id, entry_date, entry_type, description,
      source_type, source_id, source_event_id,
      total_amount, created_by
    ) VALUES (
      generate_journal_reference(CURRENT_DATE),
      CURRENT_DATE, 'reversal',
      'REVERSAL: ' || v_old_je.description || ' — reason: ' || p_reason,
      'settlement_reversal', v_settlement.id, p_event_id,
      v_old_je.total_amount, p_owner_user_id
    ) RETURNING id INTO v_reversal_je_id;

    -- Insert flipped lines (debit ↔ credit)
    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    SELECT v_reversal_je_id, account_code, credit_amount, debit_amount,
           'REVERSAL: ' || COALESCE(description, ''), line_order
    FROM journal_lines WHERE entry_id = v_old_je.id;

    -- Mark old entry as reversed
    UPDATE journal_entries
    SET is_reversed = true, reversed_by_entry_id = v_reversal_je_id, reversed_at = NOW()
    WHERE id = v_old_je.id;
  END IF;

  -- ------------------------------------------------------------------
  -- 5. Mark settlement reopened
  -- ------------------------------------------------------------------
  UPDATE event_settlements
  SET is_reopened = true, reopened_at = NOW(), reopened_by = p_owner_user_id, reopen_reason = p_reason
  WHERE id = v_settlement.id;

  -- ------------------------------------------------------------------
  -- 6. Unlock event + recap
  -- ------------------------------------------------------------------
  UPDATE events SET status = 'awaiting_settlement', updated_at = NOW() WHERE id = p_event_id;
  UPDATE crew_rekap
  SET status = 'reviewed', locked = false, locked_at = NULL, settled_at = NULL,
      stock_committed_at = NULL, stock_movement_batch_id = NULL
  WHERE event_id = p_event_id;

  -- ------------------------------------------------------------------
  -- 7. Audit log
  -- ------------------------------------------------------------------
  INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
  VALUES (
    'event_settlement', v_settlement.id, 'reopen',
    jsonb_build_object(
      'after', jsonb_build_object(
        'event_id', p_event_id, 'reason', p_reason,
        'reversal_journal_id', v_reversal_je_id
      )
    ),
    p_owner_user_id
  );

  RETURN jsonb_build_object(
    'settlement_id',         v_settlement.id,
    'reversal_journal_id',   v_reversal_je_id,
    'reversal_stock_batch',  v_batch_id,
    'reason',                p_reason
  );
END;
$$;

COMMENT ON FUNCTION reopen_settlement IS
  'Atomic reopen settlement (super_admin only). Reverses sinking/owner/stock/journal, unlocks event+recap, audit-logs. Returns JSONB with reversal IDs.';

-- Verification:
--   SELECT settle_event('<event-uuid>', '<owner-uuid>');
--   SELECT reopen_settlement('<event-uuid>', '<super-admin-uuid>', 'koreksi data');
