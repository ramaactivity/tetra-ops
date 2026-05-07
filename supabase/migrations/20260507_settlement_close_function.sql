-- ============================================================================
-- Settlement Engine — Atomic close + reopen
-- Run this in Supabase Dashboard → SQL Editor (one-time)
-- ============================================================================
-- These functions are SECURITY DEFINER so they can write across multiple tables
-- in a single transaction. Authorization is enforced in the calling server
-- action (must be super_admin or owner).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- close_event_settlement
-- Computes totals, allocates sinking funds + owner earnings (if profit > 0),
-- snapshots into event_settlements, updates event status, writes audit log.
-- Idempotent via UNIQUE(event_id) on event_settlements.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_event_settlement(
  p_event_id              UUID,
  p_revenue_gross         BIGINT,
  p_discount_total        BIGINT,
  p_hpp                   JSONB,    -- {mediaset, sleeve, flashdisk, pouch, photomagnet, keychain, other}
  p_opex                  JSONB,    -- {fee_lead, fee_asisten, fee_crew_c, fee_extra, transport_bbm, sewa_alat, perawatan, konsumsi, komisi_vendor, komisi_relasi, komisi_sales_direct, platform_fee, diskon_tambahan}
  p_owner_user_ids        UUID[],
  p_owner_pool_per_person BIGINT,
  p_closed_by             UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement_id    UUID;
  v_event_status     event_status;
  v_project_id       TEXT;
  v_revenue_net      BIGINT;
  v_hpp_total        BIGINT;
  v_opex_total       BIGINT;
  v_total_biaya      BIGINT;
  v_net_profit       BIGINT;
  v_margin_pct       NUMERIC(5,2);
  v_is_loss          BOOLEAN;
  v_owner_count      INTEGER;
  v_owner_pool_total BIGINT;
  v_fund             RECORD;
  v_alloc            BIGINT;
  v_total_sinking    BIGINT := 0;
  v_sinking_eq       BIGINT := 0;
  v_sinking_main     BIGINT := 0;
  v_sinking_crew     BIGINT := 0;
  v_sinking_emerg    BIGINT := 0;
  v_owner_id         UUID;
  v_operating_cash   BIGINT;
BEGIN
  -- Lock event row + read state
  SELECT status, project_id INTO v_event_status, v_project_id
    FROM events WHERE id = p_event_id FOR UPDATE;

  IF v_event_status IS NULL THEN
    RAISE EXCEPTION 'Event % not found', p_event_id USING ERRCODE = 'P0002';
  END IF;
  IF v_event_status NOT IN ('in_progress', 'awaiting_settlement') THEN
    RAISE EXCEPTION 'Event status must be in_progress or awaiting_settlement (current: %)', v_event_status USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM event_settlements WHERE event_id = p_event_id) THEN
    RAISE EXCEPTION 'Event % already settled', p_event_id USING ERRCODE = '23505';
  END IF;

  -- Compute totals
  v_revenue_net := p_revenue_gross - COALESCE(p_discount_total, 0);

  v_hpp_total := COALESCE((p_hpp->>'mediaset')::BIGINT, 0)
               + COALESCE((p_hpp->>'sleeve')::BIGINT, 0)
               + COALESCE((p_hpp->>'flashdisk')::BIGINT, 0)
               + COALESCE((p_hpp->>'pouch')::BIGINT, 0)
               + COALESCE((p_hpp->>'photomagnet')::BIGINT, 0)
               + COALESCE((p_hpp->>'keychain')::BIGINT, 0)
               + COALESCE((p_hpp->>'other')::BIGINT, 0);

  v_opex_total := COALESCE((p_opex->>'fee_lead')::BIGINT, 0)
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
                + COALESCE((p_opex->>'platform_fee')::BIGINT, 0)
                + COALESCE((p_opex->>'diskon_tambahan')::BIGINT, 0);

  v_total_biaya := v_hpp_total + v_opex_total;
  v_net_profit  := v_revenue_net - v_total_biaya;
  v_is_loss     := v_net_profit <= 0;
  v_margin_pct  := CASE WHEN v_revenue_net > 0
                        THEN ROUND((v_net_profit::NUMERIC / v_revenue_net) * 100, 2)
                        ELSE 0 END;

  -- Owner pool (skip on loss)
  v_owner_count := COALESCE(array_length(p_owner_user_ids, 1), 0);
  IF NOT v_is_loss AND v_owner_count > 0 THEN
    v_owner_pool_total := v_owner_count * COALESCE(p_owner_pool_per_person, 0);
  ELSE
    v_owner_pool_total := 0;
  END IF;

  -- Sinking fund allocations (skip on loss)
  IF NOT v_is_loss THEN
    FOR v_fund IN SELECT * FROM sinking_funds WHERE is_active = true LOOP
      IF v_fund.allocation_type = 'percentage' THEN
        v_alloc := FLOOR(v_net_profit * v_fund.allocation_value / 100);
      ELSIF v_fund.allocation_type = 'flat' THEN
        v_alloc := v_fund.allocation_value::BIGINT;
      ELSE
        v_alloc := 0;
      END IF;

      v_total_sinking := v_total_sinking + v_alloc;

      IF v_fund.code = 'equipment' THEN v_sinking_eq := v_alloc;
      ELSIF v_fund.code = 'maintenance' THEN v_sinking_main := v_alloc;
      ELSIF v_fund.code = 'crew_reserve' THEN v_sinking_crew := v_alloc;
      ELSIF v_fund.code = 'emergency' THEN v_sinking_emerg := v_alloc;
      END IF;
    END LOOP;
  END IF;

  v_operating_cash := v_net_profit - v_total_sinking - v_owner_pool_total;

  -- Snapshot
  INSERT INTO event_settlements (
    event_id, revenue_gross, discount_total, revenue_net,
    hpp_mediaset, hpp_sleeve, hpp_flashdisk, hpp_pouch,
    hpp_photomagnet, hpp_keychain, hpp_other, hpp_total,
    fee_lead, fee_asisten, fee_crew_c, fee_extra,
    transport_bbm, sewa_alat, perawatan, konsumsi,
    komisi_vendor, komisi_relasi, komisi_sales_direct,
    platform_fee, diskon_tambahan, opex_total,
    total_biaya, net_profit, margin_percentage, is_loss,
    sinking_equipment, sinking_maintenance, sinking_crew_reserve,
    sinking_emergency, sinking_total,
    owner_pool_total, owner_pool_per_person,
    operating_cash_kept,
    closed_by
  ) VALUES (
    p_event_id, p_revenue_gross, COALESCE(p_discount_total, 0), v_revenue_net,
    COALESCE((p_hpp->>'mediaset')::BIGINT, 0),
    COALESCE((p_hpp->>'sleeve')::BIGINT, 0),
    COALESCE((p_hpp->>'flashdisk')::BIGINT, 0),
    COALESCE((p_hpp->>'pouch')::BIGINT, 0),
    COALESCE((p_hpp->>'photomagnet')::BIGINT, 0),
    COALESCE((p_hpp->>'keychain')::BIGINT, 0),
    COALESCE((p_hpp->>'other')::BIGINT, 0),
    v_hpp_total,
    COALESCE((p_opex->>'fee_lead')::BIGINT, 0),
    COALESCE((p_opex->>'fee_asisten')::BIGINT, 0),
    COALESCE((p_opex->>'fee_crew_c')::BIGINT, 0),
    COALESCE((p_opex->>'fee_extra')::BIGINT, 0),
    COALESCE((p_opex->>'transport_bbm')::BIGINT, 0),
    COALESCE((p_opex->>'sewa_alat')::BIGINT, 0),
    COALESCE((p_opex->>'perawatan')::BIGINT, 0),
    COALESCE((p_opex->>'konsumsi')::BIGINT, 0),
    COALESCE((p_opex->>'komisi_vendor')::BIGINT, 0),
    COALESCE((p_opex->>'komisi_relasi')::BIGINT, 0),
    COALESCE((p_opex->>'komisi_sales_direct')::BIGINT, 0),
    COALESCE((p_opex->>'platform_fee')::BIGINT, 0),
    COALESCE((p_opex->>'diskon_tambahan')::BIGINT, 0),
    v_opex_total,
    v_total_biaya, v_net_profit, v_margin_pct, v_is_loss,
    v_sinking_eq, v_sinking_main, v_sinking_crew, v_sinking_emerg, v_total_sinking,
    v_owner_pool_total, COALESCE(p_owner_pool_per_person, 0),
    v_operating_cash,
    p_closed_by
  ) RETURNING id INTO v_settlement_id;

  -- Update event status
  UPDATE events SET status = 'completed', updated_at = NOW() WHERE id = p_event_id;

  -- Sinking fund movements (only if profit > 0)
  IF NOT v_is_loss THEN
    FOR v_fund IN SELECT * FROM sinking_funds WHERE is_active = true LOOP
      IF v_fund.allocation_type = 'percentage' THEN
        v_alloc := FLOOR(v_net_profit * v_fund.allocation_value / 100);
      ELSIF v_fund.allocation_type = 'flat' THEN
        v_alloc := v_fund.allocation_value::BIGINT;
      ELSE
        v_alloc := 0;
      END IF;

      IF v_alloc > 0 THEN
        INSERT INTO sinking_fund_movements (
          fund_id, movement_type, amount,
          source_type, source_event_id, source_settlement_id,
          description, performed_by
        ) VALUES (
          v_fund.id, 'deposit', v_alloc,
          'settlement', p_event_id, v_settlement_id,
          'Auto-allocate dari settlement event ' || v_project_id,
          p_closed_by
        );
      END IF;
    END LOOP;

    -- Owner earnings (one row per owner, profit_share)
    IF v_owner_count > 0 AND COALESCE(p_owner_pool_per_person, 0) > 0 THEN
      FOREACH v_owner_id IN ARRAY p_owner_user_ids LOOP
        INSERT INTO owner_earnings (
          owner_user_id, earning_type, amount,
          source_event_id, source_settlement_id,
          description, performed_by
        ) VALUES (
          v_owner_id, 'profit_share', p_owner_pool_per_person,
          p_event_id, v_settlement_id,
          'Bagi hasil settlement event ' || v_project_id,
          p_closed_by
        );
      END LOOP;
    END IF;
  END IF;

  -- Audit log
  INSERT INTO audit_log (
    actor_id, action, entity_type, entity_id, metadata
  ) VALUES (
    p_closed_by, 'settlement_close', 'event_settlement', v_settlement_id,
    jsonb_build_object(
      'event_id', p_event_id,
      'project_id', v_project_id,
      'net_profit', v_net_profit,
      'is_loss', v_is_loss,
      'owner_count', v_owner_count,
      'sinking_total', v_total_sinking
    )
  );

  RETURN v_settlement_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- reopen_event_settlement (super_admin only — enforced in caller)
-- Reverses sinking fund movements + owner earnings, deletes settlement,
-- sets event status back to 'awaiting_settlement', writes audit log.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reopen_event_settlement(
  p_settlement_id UUID,
  p_reason        TEXT,
  p_actor_id      UUID
) RETURNS UUID  -- returns event_id so caller can revalidate paths
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id   UUID;
  v_project_id TEXT;
  v_is_loss    BOOLEAN;
BEGIN
  SELECT s.event_id, e.project_id, s.is_loss
    INTO v_event_id, v_project_id, v_is_loss
    FROM event_settlements s
    JOIN events e ON e.id = s.event_id
   WHERE s.id = p_settlement_id
     FOR UPDATE OF s;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Settlement % not found', p_settlement_id USING ERRCODE = 'P0002';
  END IF;

  -- Reverse sinking fund movements (insert offsetting withdrawals)
  INSERT INTO sinking_fund_movements (
    fund_id, movement_type, amount,
    source_type, source_event_id, source_settlement_id,
    description, performed_by
  )
  SELECT fund_id, 'withdrawal', amount,
         'settlement', v_event_id, p_settlement_id,
         'REOPEN: ' || COALESCE(p_reason, 'no reason'),
         p_actor_id
    FROM sinking_fund_movements
   WHERE source_settlement_id = p_settlement_id
     AND movement_type = 'deposit';

  -- Reverse owner_earnings (insert offsetting negative entries)
  INSERT INTO owner_earnings (
    owner_user_id, earning_type, amount,
    source_event_id, source_settlement_id,
    description, performed_by
  )
  SELECT owner_user_id, 'adjustment', -amount,
         v_event_id, p_settlement_id,
         'REOPEN: ' || COALESCE(p_reason, 'no reason'),
         p_actor_id
    FROM owner_earnings
   WHERE source_settlement_id = p_settlement_id
     AND earning_type = 'profit_share'
     AND amount > 0;

  -- Mark settlement as reopened (don't delete — keep audit trail)
  UPDATE event_settlements
     SET is_reopened   = true,
         reopened_at   = NOW(),
         reopened_by   = p_actor_id,
         reopen_reason = p_reason
   WHERE id = p_settlement_id;

  -- Reset event status so it can be re-settled
  UPDATE events SET status = 'awaiting_settlement', updated_at = NOW() WHERE id = v_event_id;

  -- Audit
  INSERT INTO audit_log (
    actor_id, action, entity_type, entity_id, metadata
  ) VALUES (
    p_actor_id, 'settlement_reopen', 'event_settlement', p_settlement_id,
    jsonb_build_object(
      'event_id', v_event_id,
      'project_id', v_project_id,
      'reason', p_reason
    )
  );

  RETURN v_event_id;
END;
$$;

-- Grant execute to authenticated role (RLS still applies on tables; SECURITY DEFINER bypasses)
-- The server action enforces super_admin/owner role-check before calling.
GRANT EXECUTE ON FUNCTION close_event_settlement(UUID, BIGINT, BIGINT, JSONB, JSONB, UUID[], BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_event_settlement(UUID, TEXT, UUID) TO authenticated;
