-- DATA FIX (one-off, prod): remove super_admin's wrongly-allocated owner-pool
-- share from already-settled events. For each settlement that gave a super_admin
-- a profit_share, the excess (= that super_admin's share) is removed from:
--   • owner_earnings   (delete the super_admin row)
--   • event_settlements (owner_pool_total -= excess, operating_cash_kept += excess)
--   • journal_lines     (3-200 "→ Owner Pool" debit and 2-300 liability credit, -= excess)
-- Atomic DO block: any post-fix imbalance RAISEs and rolls back the whole thing.
DO $$
DECLARE
  v_sa_ids   UUID[];
  v_actor    UUID;
  r          RECORD;
  v_excess   BIGINT;
  v_journal  UUID;
  v_n3200    INTEGER;
  v_n2300    INTEGER;
  v_d        BIGINT;
  v_c        BIGINT;
  v_pool     BIGINT;
  v_earn     BIGINT;
BEGIN
  SELECT array_agg(id) INTO v_sa_ids FROM users WHERE role = 'super_admin';
  IF v_sa_ids IS NULL THEN
    RAISE NOTICE 'No super_admin users; nothing to do.';
    RETURN;
  END IF;
  v_actor := v_sa_ids[1];

  FOR r IN
    SELECT oe.source_settlement_id AS settlement_id, SUM(oe.amount) AS excess
    FROM owner_earnings oe
    WHERE oe.owner_user_id = ANY(v_sa_ids)
      AND oe.earning_type = 'profit_share'
      AND oe.source_settlement_id IS NOT NULL
    GROUP BY oe.source_settlement_id
  LOOP
    v_excess := r.excess;
    SELECT journal_entry_id INTO v_journal FROM event_settlements WHERE id = r.settlement_id;

    -- 1) delete super_admin profit_share rows for this settlement
    DELETE FROM owner_earnings
    WHERE owner_user_id = ANY(v_sa_ids)
      AND earning_type = 'profit_share'
      AND source_settlement_id = r.settlement_id;

    -- 2) settlement: shift excess from owner pool to operating cash
    UPDATE event_settlements
    SET owner_pool_total    = owner_pool_total - v_excess,
        operating_cash_kept = operating_cash_kept + v_excess
    WHERE id = r.settlement_id;

    -- 3) journal: reduce owner-pool transfer (3-200) + liability (2-300)
    IF v_journal IS NOT NULL THEN
      UPDATE journal_lines
      SET debit_amount = debit_amount - v_excess
      WHERE entry_id = v_journal AND account_code = '3-200'
        AND description LIKE '%Owner Pool%';
      GET DIAGNOSTICS v_n3200 = ROW_COUNT;

      UPDATE journal_lines
      SET credit_amount = credit_amount - v_excess
      WHERE entry_id = v_journal AND account_code = '2-300';
      GET DIAGNOSTICS v_n2300 = ROW_COUNT;

      IF v_n3200 <> 1 OR v_n2300 <> 1 THEN
        RAISE EXCEPTION 'Settlement %: expected exactly 1 owner-pool line each (3-200=%, 2-300=%)',
          r.settlement_id, v_n3200, v_n2300;
      END IF;

      -- verify journal still balances
      SELECT COALESCE(SUM(debit_amount),0), COALESCE(SUM(credit_amount),0)
        INTO v_d, v_c FROM journal_lines WHERE entry_id = v_journal;
      IF v_d <> v_c THEN
        RAISE EXCEPTION 'Journal % unbalanced after fix: D=% C=%', v_journal, v_d, v_c;
      END IF;
    END IF;

    -- 4) verify settlement pool == remaining owner_earnings for it
    SELECT owner_pool_total INTO v_pool FROM event_settlements WHERE id = r.settlement_id;
    SELECT COALESCE(SUM(amount),0) INTO v_earn
      FROM owner_earnings
      WHERE source_settlement_id = r.settlement_id AND earning_type = 'profit_share';
    IF v_pool <> v_earn THEN
      RAISE EXCEPTION 'Settlement %: owner_pool_total (%) != remaining earnings (%)',
        r.settlement_id, v_pool, v_earn;
    END IF;

    -- 5) audit trail
    INSERT INTO audit_log (entity_type, entity_id, action, changes, actor_id)
    VALUES ('event_settlement', r.settlement_id, 'correction',
            jsonb_build_object(
              'reason', 'super_admin excluded from owner pool (was wrongly counted as owner)',
              'owner_pool_reduced_by', v_excess,
              'new_owner_pool_total', v_pool),
            v_actor);

    RAISE NOTICE 'Fixed settlement %: owner pool -%, journal balanced, pool=earnings=%',
      r.settlement_id, v_excess, v_pool;
  END LOOP;
END $$;
