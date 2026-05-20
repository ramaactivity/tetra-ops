-- 20260521_inventory_v2_merge_sleeves.sql
-- ============================================================================
-- Inventory v2 — STEP 3: merge duplicate SLEEVE SKUs (canonical + pack threshold)
-- ============================================================================
--
-- User feedback (2026-05-21):
-- "ini sleeve juga ada double. tolong di merge saja. itu satunya adalah
--  minimal pemesanan ke percetakan per 1000 pcs."
--
-- Today there are 6 sleeve SKUs (3 pairs):
--   SLEEVE-2R (142 pcs, no min_alert)      ITM-SLEEVE-2R (0 pcs, min_alert 1000)
--   SLEEVE-4R (0 pcs)                      ITM-SLEEVE-4R (0 pcs, min_alert 1000)
--   SLEEVE-PR (0 pcs)                      ITM-SLEEVE-PR (0 pcs, min_alert 1000)
--
-- ITM-* variants are NOT separate items semantically — they only exist to
-- carry the "minimum order = 1000 pcs / pack" semantic. Solution analogous
-- to the box→roll merge:
--   1. Carry the 1000-threshold over to canonical SLEEVE-* via min_stock_alert
--   2. Add unit_conversion = {"pcs": 1, "pack": 1000} so Restock dialog can
--      offer "1 pack" input that auto-converts to 1000 pcs
--   3. Soft-delete ITM-SLEEVE-* duplicates (history preserved)
--
-- Stock balance preservation: SLEEVE-2R currently has 142 pcs (real stock).
-- No stock_movement re-target needed since canonical SKU keeps its stock as-is.
-- ITM-SLEEVE-* movements (likely none / zero) stay in stock_movements for audit.
--
-- Idempotent.

-- ============================================================================
-- 1. Carry pack threshold to canonical SLEEVE-*
-- ============================================================================

UPDATE inventory_items
SET
  min_stock_alert = 1000,
  unit_conversion = '{"pcs": 1, "pack": 1000}'::jsonb,
  notes = COALESCE(notes, '') ||
          E'\n[INVV2 2026-05-21] Min order ke percetakan: 1 pack = 1000 pcs. Restock dialog support unit toggle.',
  updated_at = NOW()
WHERE sku IN ('SLEEVE-2R', 'SLEEVE-4R', 'SLEEVE-PR')
  AND deleted_at IS NULL;

-- ============================================================================
-- 2. Soft-delete duplicate ITM-SLEEVE-* variants
-- ============================================================================

UPDATE inventory_items
SET
  is_active = false,
  deleted_at = NOW(),
  notes = COALESCE(notes, '') ||
          E'\n[INVV2 archived 2026-05-21] Duplicate of SLEEVE-* canonical. ' ||
          'Min-order threshold (1000 pcs/pack) carried to canonical via ' ||
          'unit_conversion + min_stock_alert.',
  updated_at = NOW()
WHERE sku IN ('ITM-SLEEVE-2R', 'ITM-SLEEVE-4R', 'ITM-SLEEVE-PR')
  AND deleted_at IS NULL;

-- ============================================================================
-- Verification queries
-- ============================================================================
-- After apply, expect:
-- SELECT sku, name, unit, unit_conversion, min_stock_alert, is_active, deleted_at IS NULL AS active
-- FROM inventory_items
-- WHERE sku LIKE '%SLEEVE%'
-- ORDER BY sku;
--
-- SLEEVE-2R       Sleeve 2R          pcs  {"pcs":1,"pack":1000}  1000  true   (kept)
-- SLEEVE-4R       Sleeve 4R          pcs  {"pcs":1,"pack":1000}  1000  true
-- SLEEVE-PR       Sleeve Polaroid    pcs  {"pcs":1,"pack":1000}  1000  true
-- ITM-SLEEVE-2R   Sleeve 2R          pcs                          1000  false  (archived)
-- ITM-SLEEVE-4R   Sleeve 4R          pcs                          1000  false
-- ITM-SLEEVE-PR   Sleeve Polaroid    pcs                          1000  false
