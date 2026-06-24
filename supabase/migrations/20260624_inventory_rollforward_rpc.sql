-- Persediaan & COGS report — monthly inventory roll-forward aggregate.
-- =================================================================
-- Per active consumable item, returns the building blocks the report needs for
-- a month [p_start, p_end): purchases, recorded usage, net movement (for the
-- derive-opening fallback), all-time current stock (for the derive-closing
-- fallback), and the latest COMMITTED opname counted_qty before / within the
-- period. The page composes Stok Awal / Pembelian / Stok Akhir / Pemakaian +
-- WAC from these.
--
-- Pure read aggregate, SECURITY INVOKER (default) → RLS still gates rows per
-- caller. Additive/idempotent (CREATE OR REPLACE), no DDL on tables, no writes.
-- Mirrors the push-down pattern of get_stock_levels (20260529).
--
-- NOTE: source is compared as ::text so an enum value not present in the type
-- (e.g. 'purchase_request' on DBs where it was never added) never raises
-- "invalid input value for enum" — it just doesn't match.

CREATE OR REPLACE FUNCTION get_inventory_rollforward(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(
  item_id uuid,
  sku text,
  name text,
  unit text,
  wac_now bigint,
  purchases_qty numeric,
  purchases_cost numeric,
  usage_qty numeric,
  net_move_in_month numeric,
  current_stock numeric,
  opname_prior_qty numeric,
  opname_this_qty numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH items AS (
    SELECT i.id, i.sku, i.name, i.unit,
           COALESCE(i.purchase_price_avg, 0)::bigint AS wac
    FROM inventory_items i
    WHERE i.category = 'inventory'
      AND i.is_active = true
      AND i.deleted_at IS NULL
  ),
  -- Movements within the period, aggregated per item.
  pm AS (
    SELECT sm.item_id,
      COALESCE(SUM(CASE WHEN sm.direction = 'in'
                         AND sm.source::text IN ('purchase','purchase_request')
                        THEN sm.quantity ELSE 0 END), 0) AS purchases_qty,
      COALESCE(SUM(CASE WHEN sm.direction = 'in'
                         AND sm.source::text IN ('purchase','purchase_request')
                        THEN sm.quantity * COALESCE(sm.unit_cost, 0) ELSE 0 END), 0) AS purchases_cost,
      COALESCE(SUM(CASE WHEN sm.direction = 'out'
                         AND sm.source::text = 'rekap_consumption'
                        THEN sm.quantity ELSE 0 END), 0) AS usage_qty,
      COALESCE(SUM(CASE sm.direction
                     WHEN 'in' THEN sm.quantity
                     WHEN 'out' THEN -sm.quantity
                     WHEN 'adjustment' THEN sm.quantity
                     ELSE 0 END), 0) AS net_move_in_month
    FROM stock_movements sm
    WHERE sm.created_at >= p_start AND sm.created_at < p_end
    GROUP BY sm.item_id
  ),
  -- All-time net = current on-hand (same sign convention as get_current_stock).
  cs AS (
    SELECT sm.item_id,
      COALESCE(SUM(CASE sm.direction
                     WHEN 'in' THEN sm.quantity
                     WHEN 'out' THEN -sm.quantity
                     WHEN 'adjustment' THEN sm.quantity
                     ELSE 0 END), 0) AS current_stock
    FROM stock_movements sm
    GROUP BY sm.item_id
  ),
  -- Latest committed opname BEFORE the period (per item).
  op_prior AS (
    SELECT DISTINCT ON (l.item_id) l.item_id, l.counted_qty
    FROM stock_take_lines l
    JOIN stock_takes t ON t.id = l.stock_take_id
    WHERE t.status = 'committed'
      AND t.committed_at < p_start
      AND l.counted_qty IS NOT NULL
    ORDER BY l.item_id, t.committed_at DESC
  ),
  -- Latest committed opname WITHIN the period (per item).
  op_this AS (
    SELECT DISTINCT ON (l.item_id) l.item_id, l.counted_qty
    FROM stock_take_lines l
    JOIN stock_takes t ON t.id = l.stock_take_id
    WHERE t.status = 'committed'
      AND t.committed_at >= p_start AND t.committed_at < p_end
      AND l.counted_qty IS NOT NULL
    ORDER BY l.item_id, t.committed_at DESC
  )
  SELECT
    it.id, it.sku, it.name, it.unit, it.wac,
    COALESCE(pm.purchases_qty, 0),
    COALESCE(pm.purchases_cost, 0),
    COALESCE(pm.usage_qty, 0),
    COALESCE(pm.net_move_in_month, 0),
    COALESCE(cs.current_stock, 0),
    op_prior.counted_qty,
    op_this.counted_qty
  FROM items it
  LEFT JOIN pm       ON pm.item_id = it.id
  LEFT JOIN cs       ON cs.item_id = it.id
  LEFT JOIN op_prior ON op_prior.item_id = it.id
  LEFT JOIN op_this  ON op_this.item_id = it.id
  ORDER BY it.sku;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_rollforward(timestamptz, timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION get_inventory_rollforward(timestamptz, timestamptz) IS
  'Persediaan & COGS report: per-item monthly building blocks (purchases, usage, net movement, current stock, prior/this-period committed opname qty). Page composes Stok Awal/Pembelian/Stok Akhir/Pemakaian + WAC.';
