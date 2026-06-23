-- Phase 1a — Atomic weighted-average cost recompute
-- =================================================================
-- Centralizes the purchase_price_avg weighted-average update behind ONE
-- row-locking RPC, replacing the per-call read-modify-write done in JS
-- (purchases.recordPurchaseBatch, purchase-requests.receivePurchaseRequest,
-- stock-movements.addStockMovement).
--
-- Two bugs this fixes:
--   1. Multi-line corruption: recordPurchaseBatch derived oldStock from a
--      SINGLE matched line (movements.find), so when the same item appeared on
--      several batch lines the incoming qty was undercounted → wrong avg.
--      Callers now AGGREGATE incoming qty + qty-weighted cost per item and pass
--      the totals here.
--   2. Lost-update race: concurrent read→update of purchase_price_avg could
--      clobber each other. SELECT ... FOR UPDATE serializes per item.
--
-- Contract: the caller MUST have already inserted the incoming stock_movements
-- rows (direction='in') BEFORE calling this — get_current_stock reads the
-- post-insert on-hand, and oldStock is derived as (newStock - incoming_qty).
--
-- Until Phase 1b collapses the duplicated column, this mirrors the value to
-- items_inventory_config.purchase_price_avg (inventory category only), matching
-- the 20260603 trigger behaviour.

CREATE OR REPLACE FUNCTION recompute_weighted_avg_cost(
  p_item_id uuid,
  p_incoming_qty numeric,
  p_incoming_cost numeric
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_avg   bigint;
  v_category  text;
  v_new_stock numeric;
  v_old_stock numeric;
  v_new_avg   bigint;
BEGIN
  -- Lock the item row to serialize concurrent avg updates (no lost update).
  SELECT purchase_price_avg, category
    INTO v_old_avg, v_category
  FROM inventory_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- On-hand AFTER the just-inserted incoming movement(s).
  v_new_stock := get_current_stock(p_item_id);
  v_old_stock := v_new_stock - COALESCE(p_incoming_qty, 0);
  IF v_old_stock < 0 THEN
    v_old_stock := 0;  -- defensive: prior negative movements shouldn't skew avg
  END IF;

  -- Degenerate (nothing on hand) → keep existing avg untouched.
  IF v_new_stock <= 0 THEN
    RETURN v_old_avg;
  END IF;

  v_new_avg := ROUND(
    (v_old_stock * COALESCE(v_old_avg, 0)
       + COALESCE(p_incoming_qty, 0) * COALESCE(p_incoming_cost, 0))
    / v_new_stock
  );

  UPDATE inventory_items
     SET purchase_price_avg = v_new_avg,
         updated_at = now()
   WHERE id = p_item_id;

  -- Mirror to satellite config (inventory only) until Phase 1b collapses it.
  IF v_category = 'inventory' THEN
    UPDATE items_inventory_config
       SET purchase_price_avg = v_new_avg,
           updated_at = now()
     WHERE item_id = p_item_id;
  END IF;

  RETURN v_new_avg;
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_weighted_avg_cost(uuid, numeric, numeric)
  TO authenticated, service_role;

COMMENT ON FUNCTION recompute_weighted_avg_cost(uuid, numeric, numeric) IS
  'Phase 1a: atomic weighted-average purchase_price_avg recompute. Caller inserts incoming stock_movements first, then passes aggregated incoming qty + qty-weighted unit cost. Row-locks inventory_items to prevent lost updates. Mirrors to items_inventory_config (inventory).';
