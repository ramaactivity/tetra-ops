-- 20260511_settlement_close_v3.sql
-- Replaces close_event_settlement() with v3 that:
--   1. Hard-gates closure on crew_rekap.is_approved = true
--      (toggleable via system_config.settlement.require_approved_rekap)
--   2. Distributes owner pool by users.share_pct when
--      system_config.settlement.owner_pool_distribution_mode = 'proportional'
--      (default 'equal' = current behavior). Falls back to equal split when
--      SUM(share_pct) ≠ 100 or any owner has NULL share_pct, with a warning
--      audit_log entry.
--   3. Snapshots auto-derived HPP (Phase C) into hpp_auto_snapshot column
--      and flags hpp_was_overridden when owner manually edited any field.
-- Idempotent — DROP + CREATE because we add optional params with defaults.

-- ============================================================================
-- Drop old signature (param list changes; CREATE OR REPLACE can't handle it)
-- ============================================================================

DROP FUNCTION IF EXISTS close_event_settlement(
	UUID, BIGINT, BIGINT, JSONB, JSONB, UUID[], BIGINT, UUID
);

-- ============================================================================
-- New v3 function
-- ============================================================================

CREATE OR REPLACE FUNCTION close_event_settlement(
	p_event_id              UUID,
	p_revenue_gross         BIGINT,
	p_discount_total        BIGINT,
	p_hpp                   JSONB,
	p_opex                  JSONB,
	p_owner_user_ids        UUID[],
	p_owner_pool_per_person BIGINT,
	p_closed_by             UUID,
	p_hpp_auto_snapshot     JSONB DEFAULT NULL,
	p_hpp_was_overridden    BOOLEAN DEFAULT FALSE
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
	v_require_approved BOOLEAN;
	v_dist_mode        TEXT;
	v_rekap_approved   BOOLEAN;
	v_share_total      NUMERIC;
	v_share_missing    INTEGER;
	v_owner_share      NUMERIC;
	v_owner_amount     BIGINT;
	v_used_proportional BOOLEAN := FALSE;
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

	-- Hard gate: require approved rekap?
	SELECT (value::TEXT)::BOOLEAN INTO v_require_approved
		FROM system_config WHERE key = 'settlement.require_approved_rekap';
	IF v_require_approved IS NULL THEN v_require_approved := TRUE; END IF;

	IF v_require_approved THEN
		SELECT is_approved INTO v_rekap_approved
			FROM crew_rekap WHERE event_id = p_event_id;
		IF v_rekap_approved IS NOT TRUE THEN
			RAISE EXCEPTION 'Rekap belum di-approve. Approve rekap dulu di /operations/%/rekap sebelum settle.', v_project_id USING ERRCODE = 'P0001';
		END IF;
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
		hpp_auto_snapshot, hpp_was_overridden,
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
		p_hpp_auto_snapshot, COALESCE(p_hpp_was_overridden, FALSE),
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

		-- Owner earnings — distribute by config flag
		IF v_owner_count > 0 AND v_owner_pool_total > 0 THEN
			SELECT (value->>0)::TEXT INTO v_dist_mode
				FROM system_config WHERE key = 'settlement.owner_pool_distribution_mode';
			-- value is JSONB string like "equal" — strip quotes
			IF v_dist_mode IS NULL THEN
				v_dist_mode := 'equal';
			ELSE
				-- value::TEXT returns "equal" with quotes; strip them
				SELECT TRIM(BOTH '"' FROM value::TEXT) INTO v_dist_mode
					FROM system_config WHERE key = 'settlement.owner_pool_distribution_mode';
			END IF;

			IF v_dist_mode = 'proportional' THEN
				-- Validate share_pct sums to 100 and no NULL
				SELECT
					COALESCE(SUM(share_pct), 0),
					COUNT(*) FILTER (WHERE share_pct IS NULL)
				INTO v_share_total, v_share_missing
				FROM users WHERE id = ANY(p_owner_user_ids);

				IF v_share_missing = 0 AND ABS(v_share_total - 100) < 0.5 THEN
					-- Distribute proportionally
					v_used_proportional := TRUE;
					FOREACH v_owner_id IN ARRAY p_owner_user_ids LOOP
						SELECT share_pct INTO v_owner_share FROM users WHERE id = v_owner_id;
						v_owner_amount := FLOOR(v_owner_pool_total * v_owner_share / 100);
						IF v_owner_amount > 0 THEN
							INSERT INTO owner_earnings (
								owner_user_id, earning_type, amount,
								source_event_id, source_settlement_id,
								description, performed_by
							) VALUES (
								v_owner_id, 'profit_share', v_owner_amount,
								p_event_id, v_settlement_id,
								'Bagi hasil settlement (' || v_owner_share || '%) event ' || v_project_id,
								p_closed_by
							);
						END IF;
					END LOOP;
				ELSE
					-- Fallback to equal + audit warning
					INSERT INTO audit_log (actor_id, action, entity_type, entity_id, metadata)
					VALUES (
						p_closed_by, 'settlement_share_pct_fallback', 'event_settlement', v_settlement_id,
						jsonb_build_object(
							'reason', 'share_pct invalid — fallback to equal split',
							'share_total', v_share_total,
							'missing_count', v_share_missing,
							'owner_pool_total', v_owner_pool_total
						)
					);
				END IF;
			END IF;

			-- Equal split (default OR fallback from proportional)
			IF NOT v_used_proportional THEN
				FOREACH v_owner_id IN ARRAY p_owner_user_ids LOOP
					INSERT INTO owner_earnings (
						owner_user_id, earning_type, amount,
						source_event_id, source_settlement_id,
						description, performed_by
					) VALUES (
						v_owner_id, 'profit_share', COALESCE(p_owner_pool_per_person, 0),
						p_event_id, v_settlement_id,
						'Bagi hasil settlement event ' || v_project_id,
						p_closed_by
					);
				END LOOP;
			END IF;
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
			'sinking_total', v_total_sinking,
			'distribution_mode', CASE WHEN v_used_proportional THEN 'proportional' ELSE 'equal' END,
			'hpp_was_overridden', COALESCE(p_hpp_was_overridden, FALSE)
		)
	);

	RETURN v_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION close_event_settlement(
	UUID, BIGINT, BIGINT, JSONB, JSONB, UUID[], BIGINT, UUID, JSONB, BOOLEAN
) TO authenticated;
