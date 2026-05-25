-- 20260525_unit_conversion_v2.sql
-- ============================================================================
-- Multi-Unit Conversion v2 — unambiguous base-multiplier shape
-- ============================================================================
--
-- WHY:
--   Legacy `inventory_items.unit_conversion` JSONB used a flat `{unit: number}`
--   shape whose semantics depended on whether the alt unit was bigger or
--   smaller than the base. SLEEVE meant "1 pack = N pcs" (multiplication),
--   but MEDIA meant "1 roll = N lembar" (division). Consumers picked one
--   interpretation per file and silently mishandled the other class.
--
--   New shape (v2) — explicit per-unit metadata:
--     {
--       "base_unit": "roll",
--       "units": {
--         "box":       { "multiplier": 2,    "denominator": null, "kind": "purchase",    "label": "Box (2 Roll)" },
--         "roll":      { "multiplier": 1,    "denominator": 1,    "kind": "base",        "label": "Roll" },
--         "lembar_4r": { "multiplier": null, "denominator": 700,  "kind": "consumption", "label": "Lembar 4R" },
--         "lembar_2r": { "multiplier": null, "denominator": 1400, "kind": "consumption", "label": "Lembar 2R" }
--       }
--     }
--
--   - `multiplier`: how many BASE units equal 1 of this unit.
--   - `denominator`: reverse for exact roundtrip (1 base = N alt).
--   - `kind`: purchase | base | consumption (drives where unit appears in UI).
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds audit columns to stock_movements + stock_take_lines.
--   2. Rewrites unit_conversion for canonical SKUs (MEDIA-*, SLEEVE-*) into v2.
--      - Adds BOX tier (1 BOX = 2 ROLL) for MEDIA-BASIC + MEDIA-PERF.
--      - Fixes SLEEVE pack multiplier from 100 → 1000 (per user spec).
--   3. Non-canonical legacy items keep their JSONB untouched — runtime helper
--      `normalizeConversion` in `src/lib/inventory/unit-conversion.ts` auto-
--      converts legacy shape so existing data keeps working.
--
-- ROLLBACK / SAFETY:
--   - All ALTER COLUMN add NULLable columns — no data loss.
--   - JSONB rewrites are per-SKU UPDATE, fully reversible by re-running the
--     legacy migration `20260521_inventory_v2_canonical_skus.sql`.
--   - No stock_movements rewrites; historical movements retain whatever
--     base-unit qty they had.

-- ============================================================================
-- 1. Audit columns
-- ============================================================================

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT NULL,
  ADD COLUMN IF NOT EXISTS quantity_in_unit NUMERIC(14, 4) NULL;

COMMENT ON COLUMN stock_movements.quantity_unit IS
  'Audit only. The unit the user actually typed (BOX, PACK, etc). NULL = base unit. Source of truth remains `quantity` (in base unit).';
COMMENT ON COLUMN stock_movements.quantity_in_unit IS
  'Audit only. The quantity the user actually typed in `quantity_unit`. NULL = same as `quantity`. Source of truth is `quantity`.';

ALTER TABLE stock_take_lines
  ADD COLUMN IF NOT EXISTS counted_breakdown JSONB NULL;

COMMENT ON COLUMN stock_take_lines.counted_breakdown IS
  'Optional multi-bundle composition: [{"qty": 10, "unit": "pack"}, {"qty": 500, "unit": "pcs", "note": "pack terbuka #1"}]. `counted_qty` (base unit) remains source of truth.';

-- ============================================================================
-- 2. Canonical SKU JSONB rewrite — v2 shape
-- ============================================================================

-- MEDIA-BASIC (4R/2R) — adds BOX tier (1 box = 2 roll)
UPDATE inventory_items
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'roll',
    'units', jsonb_build_object(
      'box',       jsonb_build_object('multiplier', 2,    'denominator', NULL, 'kind', 'purchase',    'label', 'Box (2 Roll)'),
      'roll',      jsonb_build_object('multiplier', 1,    'denominator', 1,    'kind', 'base',        'label', 'Roll'),
      'lembar_4r', jsonb_build_object('multiplier', NULL, 'denominator', 700,  'kind', 'consumption', 'label', 'Lembar 4R'),
      'lembar_2r', jsonb_build_object('multiplier', NULL, 'denominator', 1400, 'kind', 'consumption', 'label', 'Lembar 2R')
    )
  ),
  updated_at = NOW()
WHERE sku = 'MEDIA-BASIC';

-- MEDIA-PERF (Polaroid) — adds BOX tier
UPDATE inventory_items
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'roll',
    'units', jsonb_build_object(
      'box',             jsonb_build_object('multiplier', 2,    'denominator', NULL, 'kind', 'purchase',    'label', 'Box (2 Roll)'),
      'roll',            jsonb_build_object('multiplier', 1,    'denominator', 1,    'kind', 'base',        'label', 'Roll'),
      'lembar_polaroid', jsonb_build_object('multiplier', NULL, 'denominator', 1400, 'kind', 'consumption', 'label', 'Lembar Polaroid')
    )
  ),
  updated_at = NOW()
WHERE sku = 'MEDIA-PERF';

-- SLEEVE-* — fix pack multiplier (was 100 in legacy → should be 1000 per user spec)
UPDATE inventory_items
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'pcs',
    'units', jsonb_build_object(
      'pack', jsonb_build_object('multiplier', 1000, 'denominator', NULL, 'kind', 'purchase', 'label', 'Pack (1.000 pcs)'),
      'pcs',  jsonb_build_object('multiplier', 1,    'denominator', 1,    'kind', 'base',     'label', 'Pcs')
    )
  ),
  updated_at = NOW()
WHERE sku IN ('SLEEVE-4R', 'SLEEVE-2R', 'SLEEVE-PR');

-- ============================================================================
-- 3. Verification queries (run post-apply)
-- ============================================================================
-- SELECT sku, unit, jsonb_pretty(unit_conversion)
-- FROM inventory_items
-- WHERE sku IN ('MEDIA-BASIC','MEDIA-PERF','SLEEVE-4R','SLEEVE-2R','SLEEVE-PR')
-- ORDER BY sku;
--
-- Expected:
--   MEDIA-BASIC.units.box.multiplier = 2
--   MEDIA-BASIC.units.lembar_4r.denominator = 700
--   SLEEVE-4R.units.pack.multiplier = 1000
--
-- Audit columns:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'stock_movements' AND column_name IN ('quantity_unit','quantity_in_unit');
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'stock_take_lines' AND column_name = 'counted_breakdown';
