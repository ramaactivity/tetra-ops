-- Phase 3 — Per-event average consumption (forecast demand source)
-- =================================================================
-- Returns, per inventory item, the average quantity consumed PER EVENT across
-- historical event consumption (stock_movements direction='out',
-- source='rekap_consumption' — the canonical consumption-engine output).
--
-- avg_per_event[item] = SUM(quantity for item) / COUNT(DISTINCT consuming event)
--
-- The denominator is the GLOBAL number of distinct events that consumed
-- anything, so an item used in only some events is correctly diluted to its
-- expected per-event demand (e.g. flashdisk used in 3 of 6 events → 0.5/event).
--
-- The warehouse forecast multiplies this by the number of upcoming events to
-- estimate demand, then subtracts on-hand to get the shortfall. Aggregated in
-- SQL (not fetched into JS) to stay O(1) round-trips as movement history grows.

CREATE OR REPLACE FUNCTION get_consumption_per_event_avg()
RETURNS TABLE(item_id uuid, avg_per_event numeric, events_observed integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ev AS (
    SELECT COUNT(DISTINCT source_id) AS n
    FROM stock_movements
    WHERE direction = 'out'
      AND source = 'rekap_consumption'
      AND source_id IS NOT NULL
  )
  SELECT
    sm.item_id,
    SUM(sm.quantity) / NULLIF((SELECT n FROM ev), 0) AS avg_per_event,
    (SELECT n FROM ev)::int AS events_observed
  FROM stock_movements sm
  WHERE sm.direction = 'out'
    AND sm.source = 'rekap_consumption'
  GROUP BY sm.item_id;
$$;

GRANT EXECUTE ON FUNCTION get_consumption_per_event_avg() TO authenticated, service_role;

COMMENT ON FUNCTION get_consumption_per_event_avg() IS
  'Phase 3 forecast: average consumed qty per event per item, from rekap_consumption OUT movements. Denominator = global distinct consuming events. Multiply by upcoming-event count for projected demand.';
