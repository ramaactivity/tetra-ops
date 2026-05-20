-- 20260521_inventory_v2_get_current_stock_numeric.sql
-- ============================================================================
-- Inventory v2 — STEP 1.5: get_current_stock RPC INTEGER → NUMERIC
-- ============================================================================
--
-- Companion to 20260521_inventory_v2_quantity_numeric.sql. Now that
-- stock_movements.quantity is NUMERIC(12,4), the get_current_stock RPC
-- must also return NUMERIC — otherwise PostgreSQL implicitly truncates the
-- SUM result back to INTEGER, losing fractional roll precision.
--
-- PG limitation: CREATE OR REPLACE can't change return type. Use DROP+CREATE
-- (safe because all callers tolerate NUMERIC where INTEGER was expected —
-- JS Number() handles both; SQL implicit cast covers RPC callers).

DROP FUNCTION IF EXISTS get_current_stock(UUID);

CREATE FUNCTION get_current_stock(p_item_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_stock NUMERIC;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN direction = 'in' THEN quantity
      WHEN direction = 'out' THEN -quantity
      WHEN direction = 'adjustment' THEN quantity
      ELSE 0
    END
  ), 0)
  INTO v_stock
  FROM stock_movements
  WHERE item_id = p_item_id;

  RETURN COALESCE(v_stock, 0);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_current_stock(UUID) IS
  'Aggregate net stock for an inventory_item. Returns NUMERIC to support fractional roll quantities (Inventory v2, 2026-05-21). For integer items (sleeves, flashdisks), result is still a whole number — caller can cast / floor as needed.';
