-- 20260521_finance_settle_event_safety_fix.sql
-- ============================================================================
-- M8: Critical safety fix for settle_event RPC
-- ============================================================================
--
-- Bug 1 (DOUBLE-DEDUCTION):
--   reviewRekap (TS, src/lib/actions/rekap.ts) sudah deduct stok via
--   planRekapDeduction (assembly-aware: FLASHDISK+FD-BOX, KEY-FRAME+KEY-STRAP)
--   saat owner approve. Tapi settle_event RPC JUGA deduct lagi via
--   rekap_field_mapping. Hasil: setiap settled event stoknya kepotong 2x.
--   Konfirmasi pada production: event 2026-05-19 ada 2 set stock_movements
--   identik (rekap_consumption + settlement) untuk MEDIA-BASIC + SLEEVE-2R.
--
--   Fix: settle_event sekarang skip stock + bonus deduction kalau
--   crew_rekap.stock_committed_at IS NOT NULL (artinya reviewRekap sudah
--   handle). reviewRekap jadi single source of truth untuk inventory
--   consumption.
--
-- Bug 2 (ARCHIVED SKU IN MAPPING):
--   rekap_field_mapping.keychain_used → KEYCHAIN (archived by M4).
--   _validate_recap_stock_sufficient JOIN inventory_items tanpa filter
--   deleted_at → ngambil stok 0 dari KEYCHAIN → false shortage error.
--
--   Fix: tambah AND i.deleted_at IS NULL filter di validasi.
--   Plus deactivate mapping row KEYCHAIN biar walau auto_deduct=false di
--   masa depan, loop deduction skip baris itu.
--
-- Bug 3 (STALE MAPPING):
--   flashdisk_used → FLASHDISK only (missing FD-BOX). pouch_used → POUCH ok.
--   Karena reviewRekap sudah handle full assembly (and settle_event skipped
--   by Bug 1 fix), mapping ini effectively unused. But leave it as-is for
--   the case auto_deduct gets toggled off in the future (then mapping kicks
--   in but won't deduct components — known limitation, will be fully
--   addressed in next pass jika auto_deduct=false dipakai).
--
-- Idempotent.


-- ============================================================================
-- 1. Replace _validate_recap_stock_sufficient with deleted_at + committed guard
-- ============================================================================

CREATE OR REPLACE FUNCTION _validate_recap_stock_sufficient(p_recap_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_recap        RECORD;
  v_frame_size   frame_size;
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

  -- M8 guard: kalau stok sudah di-deduct via reviewRekap (rekap_consumption),
  -- skip validasi — stok current sudah ngitung deduction-nya.
  IF v_recap.stock_committed_at IS NOT NULL THEN
    RETURN jsonb_build_object('sufficient', true, 'shortages', '[]'::jsonb);
  END IF;

  v_frame_size := COALESCE(v_recap.frame_size_snapshot, v_recap.event_frame_size);

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
      AND i.deleted_at IS NULL    -- M8: skip archived SKU
      AND i.is_active = true       -- M8: skip inactive SKU
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
$func$;


-- ============================================================================
-- 2. Replace settle_event with stock_committed_at guard
--    Guards added: IF v_dline.qty_consumed > 0 AND v_recap.stock_committed_at IS NULL
--    Guards added: ... AND v_recap.stock_committed_at IS NULL; (bonus INSERT)
-- ============================================================================

CREATE OR REPLACE FUNCTION settle_event(
  p_event_id UUID,
  p_owner_user_id UUID,
  p_overrides JSONB DEFAULT NULL  -- {hpp: {...}, opex: {...}, revenue_gross, discount_total}
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
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
    IF v_dline.qty_consumed > 0 AND v_recap.stock_committed_at IS NULL THEN
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
  WHERE eb.event_id = p_event_id AND a.inventory_item_id IS NOT NULL AND v_recap.stock_committed_at IS NULL;

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
$func$;

-- ============================================================================
-- 3. Deactivate stale KEYCHAIN mapping (defensive — if auto_deduct=false
--    di masa depan, settle_event tetep ga akan touch archived item)
-- ============================================================================

UPDATE rekap_field_mapping
SET is_active = false,
    updated_at = NOW()
WHERE rekap_field = 'keychain_used'
  AND item_id IN (
    SELECT id FROM inventory_items
    WHERE sku = 'KEYCHAIN' AND deleted_at IS NOT NULL
  );
