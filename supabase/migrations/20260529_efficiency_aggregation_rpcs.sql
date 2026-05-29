-- ============================================================================
-- 20260529_efficiency_aggregation_rpcs.sql
--
-- Vercel Fluid Active-CPU efficiency: push aggregation that was being done in
-- JS (over full-table fetches + N+1 RPC loops) down into Postgres, so each
-- page invocation transfers/serializes far less data and does far less CPU.
--
-- These are pure read aggregates, SECURITY INVOKER (default) → they respect the
-- caller's RLS exactly like the direct table queries they replace. Mirrors the
-- sign conventions of the existing per-row RPCs (get_current_stock,
-- get_sinking_fund_balance) verbatim, so results are identical.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_stock_levels(p_item_ids) — batched current stock for many items.
--    Replaces: warehouse page's "fetch ALL stock_movements + O(items×movements)
--    JS computeStock", and the per-item get_current_stock loops in rekap.ts,
--    stock-takes.ts, anomaly-scanner.ts.
--    Sign convention is identical to get_current_stock: in=+, out=-, adjustment=+.
--    Pass NULL to get every item that has movements; pass an array to scope.
--    Items with no movements simply don't appear (callers default to 0).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_stock_levels(p_item_ids UUID[] DEFAULT NULL)
RETURNS TABLE(item_id UUID, stock NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    sm.item_id,
    COALESCE(SUM(
      CASE sm.direction
        WHEN 'in' THEN sm.quantity
        WHEN 'out' THEN -sm.quantity
        WHEN 'adjustment' THEN sm.quantity
        ELSE 0
      END
    ), 0) AS stock
  FROM stock_movements sm
  WHERE p_item_ids IS NULL OR sm.item_id = ANY(p_item_ids)
  GROUP BY sm.item_id;
$$;

-- ----------------------------------------------------------------------------
-- 2. get_outstanding_total() — sum of receivables still owed.
--    Replaces the identical "fetch all unpaid events' remaining_balance + JS
--    reduce" on dashboard, finance, and operations pages. Filter matches those
--    pages exactly: not deleted, not legacy-migrated, not fully paid, balance>0.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_outstanding_total()
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(remaining_balance), 0)::BIGINT
  FROM events
  WHERE deleted_at IS NULL
    AND is_migrated_legacy = false
    AND payment_status <> 'paid'
    AND remaining_balance > 0;
$$;

-- ----------------------------------------------------------------------------
-- 3. get_sinking_fund_balances() — all funds' balances in one query.
--    Replaces the per-fund get_sinking_fund_balance Promise.all loop on the
--    finance page. Sign convention identical: deposit=+, withdrawal=-.
--    LEFT JOIN so funds with zero movements still return a 0 balance row.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_sinking_fund_balances()
RETURNS TABLE(fund_id UUID, balance BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    sf.id AS fund_id,
    COALESCE(SUM(
      CASE sfm.movement_type
        WHEN 'deposit' THEN sfm.amount
        WHEN 'withdrawal' THEN -sfm.amount
        ELSE 0
      END
    ), 0)::BIGINT AS balance
  FROM sinking_funds sf
  LEFT JOIN sinking_fund_movements sfm ON sfm.fund_id = sf.id
  GROUP BY sf.id;
$$;

-- ----------------------------------------------------------------------------
-- Grants — same audience as the per-row RPCs these batch. SECURITY INVOKER
-- means RLS still gates the underlying rows per caller.
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_stock_levels(UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_outstanding_total() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_sinking_fund_balances() TO authenticated, service_role;
