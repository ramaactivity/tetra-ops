-- 20260521_inventory_v2_assembly_components.sql
-- ============================================================================
-- Inventory v2 — STEP 4: assembly-component model for FD, Keychain, Pouch
-- ============================================================================
--
-- User clarification (2026-05-21):
-- "Flashdisk... ada boxnya sebagai packaging ada unit flashdisknya. Yang
--  diberikan ke client adalah gabungan keduanya 1 set... tapi kita belanjanya
--  dari toko terpisah."
-- "Flashdisk, box, keychain dan hasil cetak foto diakhir akan diberikan ke
--  klien dimasukan kedalam pouch / totebag."
-- "keychain seperti flashdisk. Terdiri dari Keychain foto dan leather
--  strapnya... belanjanya dari toko terpisah. nanti kita rakit / digabung"
--
-- Model: track raw COMPONENTS only. No "assembled" SKUs.
-- Rekap consumption deducts components (e.g., 1 keychain_used = -1 KEY-FRAME
-- AND -1 KEY-STRAP simultaneously). Multi-SKU recipe lives in planRekapDeduction.
--
-- Variants (frame shape, strap color) lumped into ONE generic SKU per
-- component — owner doesn't track per-color/shape stock urgently; aesthetic
-- pick is at giving-time, not at stock-keeping time.
--
-- Final canonical components (post-migration):
--   FLASHDISK    — USB drive unit (kept, renamed for clarity)
--   FD-BOX       — Custom box for flashdisk (NEW canonical)
--   POUCH        — Outer pouch/totebag (kept, renamed for clarity)
--   KEY-FRAME    — Acrylic frame (NEW, generic, lumps shape variants)
--   KEY-STRAP    — Leather strap (NEW, generic, lumps color variants)
--   PHOTOMAGNET  — Photo magnet (kept, single SKU)
--
-- Archived:
--   KEYCHAIN     — was "assembled keychain" placeholder, model now component-based
--   ITM-FLASHDISK — was "Flashdisk + Box Custom" bundle, decomposed
--   ITM-POUCH-TOTEBAG — duplicate of POUCH semantically
--   ITM-KEYCHAIN-FRAME, ITM-AUT-21669, ITM-AUT-53145 — frame shape variants
--   ITM-AUT-11030, ITM-AUT-30805, ITM-AUT-70469, ITM-AUT-88927 — strap color variants
--
-- Stock preservation:
--   FLASHDISK keeps its 12 pcs (real owner inventory)
--   POUCH keeps its 12 pcs (real)
--   New SKUs (FD-BOX, KEY-FRAME, KEY-STRAP) start at 0 — owner does first Restock
--
-- Idempotent.

-- ============================================================================
-- 1. Rename existing canonical SKUs for clarity
-- ============================================================================

UPDATE inventory_items
SET
  name = 'Flashdisk (USB drive, butuh box terpisah)',
  notes = COALESCE(notes, '') ||
          E'\n[INVV2 2026-05-21] Komponen: cuma USB drive. ' ||
          'Saat kasih ke klien, dimasukkan ke FD-BOX (assemble manual). ' ||
          'Rekap flashdisk_used → deduct 1 FLASHDISK + 1 FD-BOX.',
  updated_at = NOW()
WHERE sku = 'FLASHDISK' AND deleted_at IS NULL;

UPDATE inventory_items
SET
  name = 'Pouch / Totebag (kemasan akhir ke klien)',
  notes = COALESCE(notes, '') ||
          E'\n[INVV2 2026-05-21] Wadah final yang dipake bungkus semua item ke klien ' ||
          '(flashdisk set + keychain + foto). Rekap pouch_used → 1 POUCH per event.',
  updated_at = NOW()
WHERE sku = 'POUCH' AND deleted_at IS NULL;

UPDATE inventory_items
SET
  notes = COALESCE(notes, '') ||
          E'\n[INVV2 2026-05-21] Komponen standalone, tidak butuh assembly.',
  updated_at = NOW()
WHERE sku = 'PHOTOMAGNET' AND deleted_at IS NULL;

-- ============================================================================
-- 2. Create new canonical component SKUs (idempotent via WHERE NOT EXISTS)
-- ============================================================================

INSERT INTO inventory_items (sku, name, category, unit, purchase_price_avg, is_active, min_stock_alert, notes)
SELECT v.sku, v.name, v.category::item_category, v.unit, v.purchase_price_avg, v.is_active, v.min_stock_alert, v.notes
FROM (VALUES
  ('FD-BOX',    'Box Custom Flashdisk',                 'consumable', 'pcs', 0, true, 50,
   '[INVV2 2026-05-21] Custom box untuk flashdisk. Beli terpisah dari toko box, di-rakit dengan FLASHDISK saat assemble per event. Rekap flashdisk_used auto-deduct 1 FD-BOX + 1 FLASHDISK.'),
  ('KEY-FRAME', 'Keychain Frame (acrylic, semua bentuk)', 'consumable', 'pcs', 0, true, 100,
   '[INVV2 2026-05-21] Acrylic frame untuk keychain — semua bentuk (bulat/persegi/persegi panjang) lumped. Variants tidak di-track per-shape karena pilihan estetik di giving-time. Pasangan dengan KEY-STRAP saat assemble.'),
  ('KEY-STRAP', 'Keychain Strap (leather, semua warna)',  'consumable', 'pcs', 0, true, 100,
   '[INVV2 2026-05-21] Leather strap untuk keychain — semua warna lumped. Sama logic dengan KEY-FRAME. Rekap keychain_used auto-deduct 1 KEY-FRAME + 1 KEY-STRAP.')
) AS v(sku, name, category, unit, purchase_price_avg, is_active, min_stock_alert, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_items i WHERE i.sku = v.sku
);

-- ============================================================================
-- 3. Soft-delete obsolete + variant SKUs
-- ============================================================================

UPDATE inventory_items
SET
  is_active = false,
  deleted_at = NOW(),
  notes = COALESCE(notes, '') ||
          E'\n[INVV2 archived 2026-05-21] Replaced by component-level canonical SKU. ' ||
          'See migration 20260521_inventory_v2_assembly_components.',
  updated_at = NOW()
WHERE sku IN (
  -- "Assembled" placeholder dari Phase 11 seed yang ga relevan lagi
  'KEYCHAIN',
  -- Bundle SKU dari old model
  'ITM-FLASHDISK',
  -- Duplicate pouch SKU
  'ITM-POUCH-TOTEBAG',
  -- Keychain frame shape variants (lumped into KEY-FRAME)
  'ITM-KEYCHAIN-FRAME',
  'ITM-AUT-21669',
  'ITM-AUT-53145',
  -- Keychain strap color variants (lumped into KEY-STRAP)
  'ITM-AUT-11030',
  'ITM-AUT-30805',
  'ITM-AUT-70469',
  'ITM-AUT-88927'
)
AND deleted_at IS NULL;

-- ============================================================================
-- Verification queries
-- ============================================================================
-- After apply:
-- SELECT sku, name, unit, min_stock_alert, is_active, deleted_at IS NULL AS active
-- FROM inventory_items
-- WHERE sku IN ('FLASHDISK','FD-BOX','POUCH','KEY-FRAME','KEY-STRAP','PHOTOMAGNET',
--               'KEYCHAIN','ITM-FLASHDISK','ITM-POUCH-TOTEBAG',
--               'ITM-KEYCHAIN-FRAME','ITM-AUT-21669','ITM-AUT-53145',
--               'ITM-AUT-11030','ITM-AUT-30805','ITM-AUT-70469','ITM-AUT-88927')
-- ORDER BY active DESC, sku;
--
-- Active (6): FLASHDISK, FD-BOX, POUCH, KEY-FRAME, KEY-STRAP, PHOTOMAGNET
-- Archived (10): KEYCHAIN + 9 ITM-* variants
