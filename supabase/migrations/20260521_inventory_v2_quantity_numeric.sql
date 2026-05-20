-- 20260521_inventory_v2_quantity_numeric.sql
-- ============================================================================
-- Inventory v2 — STEP 1: stock_movements.quantity INTEGER → NUMERIC(12,4)
-- ============================================================================
--
-- Rationale: new roll-based model needs fractional quantities. E.g., 200 prints
-- 4R consumes 200/700 = 0.2857 roll basic. INTEGER cannot represent this.
--
-- NUMERIC(12,4) supports:
--   - up to 99,999,999.9999 (8 integer digits, 4 decimal)
--   - precision sufficient for: 1 milli-roll = 0.001 roll, but we use 4 decimals
--     to preserve exact derivation from print-count (avoids rounding drift)
--
-- Idempotent — checks current column type before ALTER.
--
-- DEPENDENT RPCs that need cast adjustment (see migrations after this):
--   - settle_event (20260520_settle_event_wrappers.sql line 746, 758) uses
--     ::INTEGER cast on computed quantities — will lose precision when
--     fractional rolls are involved. Updated in step 3.

DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'stock_movements'
    AND column_name = 'quantity';

  IF v_type = 'integer' THEN
    -- Convert. Existing rows preserved (integer values are valid NUMERIC).
    ALTER TABLE stock_movements
      ALTER COLUMN quantity TYPE NUMERIC(12, 4);
    RAISE NOTICE 'stock_movements.quantity converted INTEGER → NUMERIC(12,4)';
  ELSE
    RAISE NOTICE 'stock_movements.quantity already %, skip', v_type;
  END IF;
END $$;

-- Document semantic
COMMENT ON COLUMN stock_movements.quantity IS
  'Always positive (direction enum determines sign). NUMERIC(12,4) to support fractional roll consumption (e.g., 200 prints 4R = 200/700 = 0.2857 roll basic).';

-- ============================================================================
-- Companion: inventory_items.purchase_price_avg
-- ============================================================================
-- Already BIGINT, supports per-roll prices up to ~9.2 × 10^18. No change.
-- Documentation refresh only.

COMMENT ON COLUMN inventory_items.purchase_price_avg IS
  'Weighted-average cost per BASE UNIT (e.g., per-roll for MEDIA-BASIC, per-pcs for SLEEVE-4R). Updated on each purchase movement via addStockMovement.';

COMMENT ON COLUMN inventory_items.unit_conversion IS
  'JSONB mapping alternate units to base-unit multipliers. Base unit always = 1. Example for MEDIA-BASIC (base=roll): {"roll": 1, "lembar_4r": 700, "lembar_2r": 1400}. UI uses for display + restock dialog unit toggle.';

-- ============================================================================
-- Verification queries (run post-apply):
-- ============================================================================
-- SELECT column_name, data_type, numeric_precision, numeric_scale
-- FROM information_schema.columns
-- WHERE table_name = 'stock_movements' AND column_name = 'quantity';
-- Expected: data_type=numeric, precision=12, scale=4
