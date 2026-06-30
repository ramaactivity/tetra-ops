-- 20260630b_settlement_alloc_human_desc.sql
-- Keterangan Dana Cadangan (sinking_fund_movements) & Bagi Hasil Owner
-- (owner_earnings) pakai bahasa manusia. Body settle_event IDENTIK dgn
-- 20260616 — HANYA 2 string keterangan yang berubah (pakai nama klien).
-- Plus backfill baris yang sudah ada.

-- 20260616_settle_event_owner_pool_exclude_superadmin.sql
-- FIX: super_admin (Tetra) was counted as an OWNER in the owner-pool
-- distribution. Owners = role='owner' only; super_admin is admin-only and
-- must NOT receive owner-pool profit share. Changes ONLY the owner-pool
-- count/distribution from role IN ('owner','super_admin') to role='owner'.
-- The actor permission check (line "v_actor_role NOT IN ('owner','super_admin')")
-- is UNCHANGED — super_admin may still perform settlement.
-- Body is otherwise identical to 20260615. Settled events are immutable;
-- applies to new settlements only.

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
  IF v_recap.stock_committed_at IS NULL THEN
    RAISE EXCEPTION 'Rekap belum commit stok. Approve ulang rekap dulu sebelum settle (single engine).'
      USING ERRCODE = '42P01';
  END IF;

  -- 3. Stock sufficiency CHECK — warning only, NOT blocking
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
      -- FIX: komisi dari kolom event (sebelumnya hardcoded 0 → laba lebih-saji).
      'komisi_vendor',       COALESCE(v_event.vendor_commission_amount, 0),
      'komisi_relasi',       COALESCE(v_event.referrer_commission, 0),
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

  SELECT COUNT(*) INTO v_owner_count FROM users WHERE role = 'owner' AND is_active = true;
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
          'Setoran otomatis saat tutup event — ' || COALESCE(NULLIF(TRIM(v_event.client_name), ''), 'tanpa nama klien'), p_owner_user_id
        );
      END IF;
    END LOOP;
  END IF;

  -- 13. Owner pool earnings
  IF v_owner_pool_tot > 0 THEN
    IF v_dist_mode = 'proportional' THEN
      SELECT COALESCE(SUM(share_pct), 0) INTO v_share_total
      FROM users WHERE role = 'owner' AND is_active = true;
      IF ABS(v_share_total - 100) > 0.01 OR EXISTS (
        SELECT 1 FROM users WHERE role = 'owner' AND is_active = true AND share_pct IS NULL
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
      WHERE role = 'owner' AND is_active = true
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
        'Bagi hasil otomatis saat tutup event — ' || COALESCE(NULLIF(TRIM(v_event.client_name), ''), 'tanpa nama klien'), p_owner_user_id
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
  'Atomic settle event v4 (canonical-HPP + komisi). HPP dari hpp_snapshot; komisi_vendor/relasi dari events.vendor_commission_amount/referrer_commission (fix lebih-saji). WAJIB stock_committed_at NOT NULL.';

-- ============================================================================
-- Backfill baris lama
-- ============================================================================
UPDATE sinking_fund_movements sfm
SET description = 'Setoran otomatis saat tutup event — ' || COALESCE(NULLIF(TRIM(e.client_name), ''), 'tanpa nama klien')
FROM events e
WHERE sfm.source_event_id = e.id
  AND sfm.description = 'Auto-allocation from settle_event';

UPDATE owner_earnings oe
SET description = 'Bagi hasil otomatis saat tutup event — ' || COALESCE(NULLIF(TRIM(e.client_name), ''), 'tanpa nama klien')
FROM events e
WHERE oe.source_event_id = e.id
  AND oe.description = 'Auto-distribution from settle_event';
