-- 20260609_settle_event_canonical_hpp.sql
-- ============================================================================
-- Phase 2 — "One Canonical Consumption Engine".
-- ============================================================================
-- settle_event sekarang BACA crew_rekap.hpp_snapshot (di-tulis saat approval
-- oleh planner kanonik) sebagai sumber HPP — bukan lagi calculate_recap_hpp.
-- Konsekuensi: HPP = nilai stok yang benar-benar keluar, jurnal inventory
-- credit = stock_movements value, assembly + bundle ikut ke-cost.
--
-- Perubahan settle_event vs 20260522:
--   1. HARD-REQUIRE crew_rekap.stock_committed_at NOT NULL (stok WAJIB sudah
--      di-deduct saat approval — single engine). Kalau NULL → error.
--   2. v_hpp_auto := COALESCE(hpp_snapshot, calculate_recap_hpp(...)) —
--      snapshot menang; calculate_recap_hpp cuma fallback transisi.
--   3. HAPUS §11 (loop deduksi rekap_field_mapping + bonus insert). Stok sudah
--      keluar di approval (source 'rekap_consumption'). Ini juga membunuh bug
--      truncation (qty*qpu)::INTEGER pada media roll fraksional.
--
-- Perubahan reopen_settlement:
--   4. Restore stok dari source IN ('settlement','rekap_consumption') — FIX bug
--      laten: dulu cuma 'settlement' jadi stok hasil approval tidak ter-restore.
--   5. Clear hpp_snapshot saat reopen → re-settle wajib lewat re-approval
--      (re-commit stok + re-snapshot di harga saat itu).
--
-- DDL idempotent (CREATE OR REPLACE). WAJIB diverifikasi di DB (settle event
-- test → cek Dr=Cr, snapshot==nilai stok) sebelum dianggap selesai.

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
BEGIN
  -- 1. Validate actor & event
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

  -- 2. Validate recap exists & approved
  SELECT * INTO v_recap FROM crew_rekap WHERE event_id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rekap belum di-submit untuk event %', p_event_id USING ERRCODE = 'P0002';
  END IF;
  IF v_recap.status NOT IN ('reviewed', 'settled') AND v_recap.is_approved IS NOT TRUE THEN
    RAISE EXCEPTION 'Rekap belum di-review/approve. Status saat ini: %', v_recap.status USING ERRCODE = '42P01';
  END IF;

  -- 2b. Single-engine invariant: stok WAJIB sudah di-commit saat approval.
  --     Kalau belum, approval-nya tidak nge-deduct (atau data lama) → tolak.
  IF v_recap.stock_committed_at IS NULL THEN
    RAISE EXCEPTION 'Rekap belum commit stok. Approve ulang rekap dulu sebelum settle (single engine).'
      USING ERRCODE = '42P01';
  END IF;

  -- ------------------------------------------------------------------
  -- 3. Stock sufficiency CHECK — warning only, NOT blocking
  -- ------------------------------------------------------------------
  v_stock_check := _validate_recap_stock_sufficient(v_recap.id);
  IF NOT (v_stock_check->>'sufficient')::BOOLEAN THEN
    INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
    VALUES (
      'event_settlement',
      NULL,
      'stock_warning',
      jsonb_build_object(
        'event_id', p_event_id,
        'recap_id', v_recap.id,
        'shortages', v_stock_check->'shortages',
        'note', 'Stock akan minus setelah deduction. Restock untuk recover balance.'
      ),
      p_owner_user_id
    );
  END IF;

  -- 4. HPP & OpEx. HPP dari snapshot kanonik (di-tulis saat approval). Fallback
  --    ke calculate_recap_hpp cuma buat rekap lama tanpa snapshot (transisi).
  v_hpp_auto  := COALESCE(v_recap.hpp_snapshot, calculate_recap_hpp(v_recap.id));
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

  -- 5. Revenue from grand_total
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

  v_revenue_net := COALESCE(
    NULLIF(v_event.grand_total, 0)::BIGINT,
    v_revenue_gross - v_discount
  );

  -- 6. Compute totals
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

  -- 7. Sinking fund allocation
  IF NOT v_is_loss THEN
    FOR v_fund IN SELECT * FROM sinking_funds WHERE is_active = true ORDER BY display_order LOOP
      IF v_fund.allocation_type = 'percentage' THEN
        v_alloc := FLOOR(v_net_profit * v_fund.allocation_value / 100)::BIGINT;
      ELSE
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

  -- 8. Owner pool
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

  -- 9. Operating cash
  v_operating_cash := GREATEST(v_net_profit - v_sink_total - v_owner_pool_tot, 0);

  -- 10. INSERT event_settlements
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

  -- 11. Stok SUDAH di-deduct saat rekap approval (source 'rekap_consumption').
  --     settle_event TIDAK lagi nge-deduct (single canonical engine). Cukup
  --     referensikan batch yang sudah ada untuk response.
  v_batch_id := v_recap.stock_movement_batch_id;

  -- 12. Sinking fund movements
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

  -- 13. Owner pool earnings
  IF v_owner_pool_tot > 0 THEN
    IF v_dist_mode = 'proportional' THEN
      SELECT COALESCE(SUM(share_pct), 0) INTO v_share_total
      FROM users WHERE role IN ('owner','super_admin') AND is_active = true;
      IF ABS(v_share_total - 100) > 0.01 OR EXISTS (
        SELECT 1 FROM users WHERE role IN ('owner','super_admin') AND is_active = true AND share_pct IS NULL
      ) THEN
        v_dist_mode := 'equal';
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

  -- 14. Journal entry
  v_journal_id := _create_settlement_journal(
    v_settlement_id, p_event_id, v_hpp, v_opex,
    v_revenue_net, v_sink_total, v_owner_pool_tot, v_operating_cash,
    p_owner_user_id, v_event.event_date
  );

  UPDATE event_settlements SET journal_entry_id = v_journal_id WHERE id = v_settlement_id;

  -- 15. Lock event + recap
  UPDATE events SET status = 'completed', updated_at = NOW() WHERE id = p_event_id;
  UPDATE crew_rekap
  SET status = 'settled', locked = true, locked_at = NOW(), settled_at = NOW()
  WHERE id = v_recap.id;

  -- 16. Audit log
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
        'owner_pool_total', v_owner_pool_tot,
        'stock_shortage_warning', NOT (v_stock_check->>'sufficient')::BOOLEAN
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
    'operating_cash',    v_operating_cash,
    'stock_shortages',   v_stock_check->'shortages'
  );
END;
$$;

COMMENT ON FUNCTION settle_event IS
  'Atomic settle event v3 (canonical-HPP). HPP dari crew_rekap.hpp_snapshot (single engine; fallback calculate_recap_hpp utk data lama). WAJIB stock_committed_at NOT NULL — stok di-deduct di approval, bukan di sini. Tetap create settlement+sinking+owner_earnings+journal, lock event+recap.';


-- ============================================================================
-- reopen_settlement — FIX restore source + clear snapshot
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
  v_batch_id        UUID;
BEGIN
  SELECT role INTO v_actor_role FROM users WHERE id = p_owner_user_id;
  IF v_actor_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Forbidden: only super_admin can reopen settlement (actor role=%)', v_actor_role
      USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Reason wajib (minimal 5 karakter)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_settlement FROM event_settlements WHERE event_id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement tidak ditemukan untuk event %', p_event_id USING ERRCODE = 'P0002';
  END IF;

  IF v_settlement.is_reopened = true THEN
    RAISE EXCEPTION 'Settlement % sudah pernah di-reopen', v_settlement.id USING ERRCODE = '42P01';
  END IF;

  -- 1. Reverse sinking fund movements
  INSERT INTO sinking_fund_movements (
    fund_id, movement_type, amount, source_type, source_event_id, source_settlement_id,
    description, performed_by
  )
  SELECT fund_id, 'withdrawal', amount, 'settlement', p_event_id, v_settlement.id,
         'REOPEN reverse: ' || p_reason, p_owner_user_id
  FROM sinking_fund_movements
  WHERE source_settlement_id = v_settlement.id AND movement_type = 'deposit';

  -- 2. Reverse owner earnings
  INSERT INTO owner_earnings (
    owner_user_id, earning_type, amount, source_event_id, source_settlement_id,
    description, performed_by
  )
  SELECT owner_user_id, 'adjustment', -amount, p_event_id, v_settlement.id,
         'REOPEN reverse: ' || p_reason, p_owner_user_id
  FROM owner_earnings
  WHERE source_settlement_id = v_settlement.id AND earning_type = 'profit_share';

  -- 3. Reverse stock movements (positive 'in' offsets).
  --    FIX: restore dari source 'settlement' DAN 'rekap_consumption' — stok
  --    konsumsi sekarang di-deduct saat approval (source rekap_consumption),
  --    jadi kalau cuma 'settlement' stok tidak akan ter-restore.
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
  WHERE source_id = p_event_id AND direction = 'out'
    AND source IN ('settlement'::movement_source, 'rekap_consumption'::movement_source);

  -- 4. Reverse journal entries (create reversal entry)
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

    INSERT INTO journal_lines (entry_id, account_code, debit_amount, credit_amount, description, line_order)
    SELECT v_reversal_je_id, account_code, credit_amount, debit_amount,
           'REVERSAL: ' || COALESCE(description, ''), line_order
    FROM journal_lines WHERE entry_id = v_old_je.id;

    UPDATE journal_entries
    SET is_reversed = true, reversed_by_entry_id = v_reversal_je_id, reversed_at = NOW()
    WHERE id = v_old_je.id;
  END IF;

  -- 5. Mark settlement reopened
  UPDATE event_settlements
  SET is_reopened = true, reopened_at = NOW(), reopened_by = p_owner_user_id, reopen_reason = p_reason
  WHERE id = v_settlement.id;

  -- 6. Unlock event + recap. Clear hpp_snapshot → re-settle WAJIB lewat
  --    re-approval (re-commit stok + re-snapshot di harga saat itu).
  UPDATE events SET status = 'awaiting_settlement', updated_at = NOW() WHERE id = p_event_id;
  UPDATE crew_rekap
  SET status = 'reviewed', locked = false, locked_at = NULL, settled_at = NULL,
      stock_committed_at = NULL, stock_movement_batch_id = NULL,
      hpp_snapshot = NULL, hpp_snapshot_total = NULL, is_approved = false
  WHERE event_id = p_event_id;

  -- 7. Audit log
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
  'Atomic reopen settlement (super_admin only). Reverses sinking/owner/journal + restores stok (source settlement & rekap_consumption), clears hpp_snapshot + un-approves recap (re-settle harus re-approve), audit-logs.';
