-- 20260521_inventory_v2_canonical_skus.sql
-- ============================================================================
-- Inventory v2 — STEP 2: canonicalize SKUs to Roll-based model
-- ============================================================================
--
-- DECISIONS (user-confirmed 2026-05-21):
--   • 2 media SKUs only: MEDIA-BASIC (4R/2R) + MEDIA-PERF (Polaroid)
--   • Base unit = "roll" (NUMERIC stock, fractional allowed via 20260521_inventory_v2_quantity_numeric.sql)
--   • Capacity: 1 roll basic = 700 prints 4R = 1400 prints 2R | 1 roll perf = 1400 polaroid
--   • Owner thinks in rolls + secondary lembar/print display
--   • Clean slate: soft-delete ITM-BOX-*, ITM-PCS-* duplicates (history preserved)
--   • Reset MEDIA-BASIC + MEDIA-PERF stock to 0 with a reset_baseline movement
--     (old lembar-based history archived in stock_movements; new tracking from 0 roll)
--
-- Idempotent — safe to re-run.

-- ============================================================================
-- 1. Update canonical SKUs (MEDIA-BASIC, MEDIA-PERF) with new schema
-- ============================================================================

UPDATE inventory_items
SET
  name = 'Mediaset Basic Roll (4R/2R)',
  unit = 'roll',
  unit_conversion = '{"roll": 1, "lembar_4r": 700, "lembar_2r": 1400}'::jsonb,
  min_stock_alert = 1,  -- alert when less than 1 roll left
  updated_at = NOW()
WHERE sku = 'MEDIA-BASIC';

UPDATE inventory_items
SET
  name = 'Mediaset Perforated Roll (Polaroid)',
  unit = 'roll',
  unit_conversion = '{"roll": 1, "lembar_polaroid": 1400}'::jsonb,
  min_stock_alert = 1,
  updated_at = NOW()
WHERE sku = 'MEDIA-PERF';

-- ============================================================================
-- 2. Update SLEEVE-* with explicit unit_conversion (no change to unit/qty)
-- ============================================================================

UPDATE inventory_items
SET
  unit_conversion = '{"pcs": 1, "pack": 100}'::jsonb,
  updated_at = NOW()
WHERE sku IN ('SLEEVE-4R', 'SLEEVE-2R', 'SLEEVE-PR');

-- ============================================================================
-- 3. Reset MEDIA-BASIC + MEDIA-PERF stock baseline
-- ============================================================================
-- Logic: aggregate current stock per item, then insert an adjustment movement
-- that brings stock back to 0 (positive if currently negative, negative if
-- currently positive). Inserts opening-balance trail = traceable + reversible.

-- Reset MEDIA-BASIC
WITH curr AS (
  SELECT
    i.id AS item_id,
    COALESCE(SUM(
      CASE
        WHEN m.direction = 'in' THEN m.quantity
        WHEN m.direction = 'out' THEN -m.quantity
        ELSE m.quantity
      END
    ), 0) AS current_stock
  FROM inventory_items i
  LEFT JOIN stock_movements m ON m.item_id = i.id
  WHERE i.sku = 'MEDIA-BASIC'
  GROUP BY i.id
)
INSERT INTO stock_movements (
  ref_id, item_id, direction, quantity, unit_cost, source,
  source_description, notes, performed_by, created_at
)
SELECT
  'MOV-A-INVV2-MB-' || floor(random() * 100000)::text,
  item_id,
  'adjustment',
  ABS(current_stock),  -- always positive (direction makes sign implicit)
  0,
  'manual_adjust',
  'Inventory v2 baseline reset — MEDIA-BASIC switched from lembar to roll',
  CASE
    WHEN current_stock < 0 THEN
      'Reset from ' || current_stock || ' lembar → 0 roll. Old lembar-based history preserved in stock_movements but no longer surfaced in warehouse list. Owner: do a Restock to set new baseline.'
    WHEN current_stock > 0 THEN
      'Reset from ' || current_stock || ' lembar → 0 roll. Pre-v2 positive stock cleared; owner: do a Restock to set new roll baseline.'
    ELSE
      'Reset from 0 lembar → 0 roll (clean transition)'
  END,
  NULL,
  NOW()
FROM curr
WHERE current_stock != 0;

-- Reset MEDIA-PERF
WITH curr AS (
  SELECT
    i.id AS item_id,
    COALESCE(SUM(
      CASE
        WHEN m.direction = 'in' THEN m.quantity
        WHEN m.direction = 'out' THEN -m.quantity
        ELSE m.quantity
      END
    ), 0) AS current_stock
  FROM inventory_items i
  LEFT JOIN stock_movements m ON m.item_id = i.id
  WHERE i.sku = 'MEDIA-PERF'
  GROUP BY i.id
)
INSERT INTO stock_movements (
  ref_id, item_id, direction, quantity, unit_cost, source,
  source_description, notes, performed_by, created_at
)
SELECT
  'MOV-A-INVV2-MP-' || floor(random() * 100000)::text,
  item_id,
  'adjustment',
  ABS(current_stock),
  0,
  'manual_adjust',
  'Inventory v2 baseline reset — MEDIA-PERF switched from lembar to roll',
  CASE
    WHEN current_stock < 0 THEN
      'Reset from ' || current_stock || ' lembar → 0 roll. Owner: do a Restock to set new roll baseline.'
    WHEN current_stock > 0 THEN
      'Reset from ' || current_stock || ' lembar → 0 roll. Pre-v2 positive stock cleared.'
    ELSE
      'Reset from 0 lembar → 0 roll (clean transition)'
  END,
  NULL,
  NOW()
FROM curr
WHERE current_stock != 0;

-- IMPORTANT: signed reset.
-- The above INSERT uses direction='adjustment' with ABS(quantity). PostgreSQL
-- doesn't natively distinguish positive vs negative adjustment; UI computes
-- net stock via SUM(CASE direction). Adjustment direction is treated as +sign
-- by get_current_stock RPC (verified in 20260511_stock_take.sql).
--
-- To produce the OPPOSITE sign (reset positive stock back to 0), we'd need
-- a 'out' direction. Re-do reset for items with positive current_stock:

-- Re-do MEDIA-BASIC if currently positive (the above adjustment ADDED, doubling it)
DO $$
DECLARE
  v_item_id UUID;
  v_curr NUMERIC;
BEGIN
  SELECT i.id, COALESCE(SUM(
    CASE
      WHEN m.direction = 'in' THEN m.quantity
      WHEN m.direction = 'out' THEN -m.quantity
      ELSE m.quantity
    END
  ), 0) INTO v_item_id, v_curr
  FROM inventory_items i
  LEFT JOIN stock_movements m ON m.item_id = i.id
  WHERE i.sku = 'MEDIA-BASIC'
  GROUP BY i.id;

  -- If after the adjustment insert, stock != 0, do an 'out' to clear
  IF v_curr > 0 THEN
    INSERT INTO stock_movements (
      ref_id, item_id, direction, quantity, unit_cost, source,
      source_description, notes, performed_by, created_at
    ) VALUES (
      'MOV-O-INVV2-MB-' || floor(random() * 100000)::text,
      v_item_id, 'out', v_curr, 0, 'manual_adjust',
      'Inventory v2 — clear residual positive stock',
      'Final clear to 0 roll baseline',
      NULL, NOW()
    );
  END IF;
END $$;

-- Re-do MEDIA-PERF
DO $$
DECLARE
  v_item_id UUID;
  v_curr NUMERIC;
BEGIN
  SELECT i.id, COALESCE(SUM(
    CASE
      WHEN m.direction = 'in' THEN m.quantity
      WHEN m.direction = 'out' THEN -m.quantity
      ELSE m.quantity
    END
  ), 0) INTO v_item_id, v_curr
  FROM inventory_items i
  LEFT JOIN stock_movements m ON m.item_id = i.id
  WHERE i.sku = 'MEDIA-PERF'
  GROUP BY i.id;

  IF v_curr > 0 THEN
    INSERT INTO stock_movements (
      ref_id, item_id, direction, quantity, unit_cost, source,
      source_description, notes, performed_by, created_at
    ) VALUES (
      'MOV-O-INVV2-MP-' || floor(random() * 100000)::text,
      v_item_id, 'out', v_curr, 0, 'manual_adjust',
      'Inventory v2 — clear residual positive stock',
      'Final clear to 0 roll baseline',
      NULL, NOW()
    );
  END IF;
END $$;

-- Reset purchase_price_avg to 0 — will be recomputed on next Restock
UPDATE inventory_items
SET purchase_price_avg = 0,
    updated_at = NOW()
WHERE sku IN ('MEDIA-BASIC', 'MEDIA-PERF');

-- ============================================================================
-- 4. Soft-delete duplicate SKUs
-- ============================================================================

UPDATE inventory_items
SET is_active = false,
    deleted_at = NOW(),
    notes = COALESCE(notes, '') ||
            E'\n[INVV2 archived 2026-05-21] Duplicate of MEDIA-BASIC/MEDIA-PERF in roll model. Stock history preserved in stock_movements.',
    updated_at = NOW()
WHERE sku IN ('ITM-BOX-4R', 'ITM-BOX-POL', 'ITM-PCS-4R', 'ITM-PCS-POL')
  AND deleted_at IS NULL;

-- ============================================================================
-- 5. Verification queries (run post-apply)
-- ============================================================================
-- SELECT sku, name, unit, unit_conversion, is_active, purchase_price_avg
-- FROM inventory_items
-- WHERE sku IN ('MEDIA-BASIC','MEDIA-PERF','ITM-BOX-4R','ITM-BOX-POL','ITM-PCS-4R','ITM-PCS-POL')
-- ORDER BY sku;
--
-- Expected:
--   MEDIA-BASIC: unit='roll', conversion={roll:1, lembar_4r:700, lembar_2r:1400}, is_active=true
--   MEDIA-PERF:  unit='roll', conversion={roll:1, lembar_polaroid:1400}, is_active=true
--   ITM-*: is_active=false, deleted_at IS NOT NULL
--
-- Stock check:
-- SELECT i.sku, COALESCE(SUM(
--   CASE WHEN m.direction='in' THEN m.quantity
--        WHEN m.direction='out' THEN -m.quantity
--        ELSE m.quantity END
-- ), 0) AS current_stock
-- FROM inventory_items i
-- LEFT JOIN stock_movements m ON m.item_id = i.id
-- WHERE i.sku IN ('MEDIA-BASIC','MEDIA-PERF')
-- GROUP BY i.sku;
--
-- Expected: both 0 (baseline reset complete).
