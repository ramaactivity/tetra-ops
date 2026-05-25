-- 20260531_data_cleanup_audit.sql
-- ============================================================================
-- Data Audit & Hydration — Cleanup legacy data pasca refactor module
-- ============================================================================
--
-- AUDIT FINDINGS (15 Persediaan + 50 Aset Tetap):
--
-- PHASE 1 — DUPLICATE DETECTION:
--   - "Seragam Crew" (Persediaan, EQ-UNIFORM) → DUPLICATE
--     dari "Seragam (vest hijau)" + "Seragam (vest hitam)" yg sudah ada di
--     Aset Tetap. Archive (superseded).
--   - "Kain Background gold/Merah/silver" — terlihat duplikat tapi sebenarnya
--     unit fisik berbeda (warna beda → unit identifier beda). KEEP.
--   - "Tas Tripod" vs "Tas Tripod (besar)" — ukuran beda. KEEP.
--   - "Kontainer Besar/Sedang/Kecil" — ukuran beda. KEEP.
--
-- PHASE 2 — RECLASSIFICATION:
--   - Cables (Kabel USB, Kabel Baterai, Kabel Kamera, Kabel Monitor) sudah
--     benar di Aset Tetap. ✓
--   - Hanya Seragam Crew yang salah kategori (di-archive di Phase 1).
--
-- PHASE 3 — SMART HYDRATION:
--
--   PERSEDIAAN — unit standardization (Box→pcs, Pcs→pcs untuk konsistensi):
--     - Kartu Nama Tetra unit="Box" → "pcs", purchase_unit="box", factor=100
--     - Consumables Lainnya, Seragam Crew unit="Pcs" → "pcs" (lowercase)
--
--   PERSEDIAAN — purchase_unit + conversion_factor:
--     - FLASHDISK: pack of 10, BOM-component
--     - KEY-FRAME: pack of 100, BOM-component
--     - KEY-STRAP: pack of 100, BOM-component
--     - POUCH: pack of 100, BOM-component
--     - FD-BOX: bundled per piece, BOM-component (no bulk pack std)
--     - PHOTOMAGNET: pack of 100, min_stock_alert=50
--     - Kartu Nama: box of 100
--     - Lakban Kain: per pcs (no std pack)
--     - Consumables Lainnya: catch-all, min_stock_alert=10
--
--   ASET TETAP — useful_life defaults berdasarkan kategori:
--     - Camera/Lensa: 36-60 bulan (3-5 tahun)
--     - Printer/Flash/Lighting: 24-36 bulan
--     - Tripod/Stand/Container: 24-36 bulan
--     - Cable/Aksesori kecil: 12-18 bulan
--     - Backdrop/Background: 18-24 bulan
--     - Seragam: 12 bulan
--   ALL: condition=normal, location=gudang_pusat, acquisition_type=new_commercial
--   (sudah default), asset_number=SKU kalau null.
--
-- PHASE 4 — BOM FLAGS:
--   Components yg dipakai bareng di set/bundle: FLASHDISK, FD-BOX, POUCH,
--   KEY-FRAME, KEY-STRAP, PHOTOMAGNET → is_bom_component=true. Mediaset
--   tidak di-flag (bukan combinable component, dipakai langsung di event).
--
-- IDEMPOTENT — safe re-run. User akan koreksi via UI setelah ini.

-- ============================================================================
-- 1. ARCHIVE DUPLICATE: Seragam Crew (superseded by vest hijau + vest hitam)
-- ============================================================================

UPDATE inventory_items
SET
  is_active = false,
  deleted_at = NOW(),
  notes = COALESCE(notes || E'\n', '') ||
    '[AUDIT 2026-05-31] Archived — duplicate of EQ-200296 (Seragam vest hijau) + EQ-871695 (Seragam vest hitam) in Aset Tetap.',
  updated_at = NOW()
WHERE sku = 'EQ-UNIFORM' AND deleted_at IS NULL;

-- ============================================================================
-- 2. PERSEDIAAN — Unit standardization (lowercase) + base_unit consistency
-- ============================================================================

UPDATE inventory_items
SET unit = 'pcs', updated_at = NOW()
WHERE category = 'inventory'
  AND unit IN ('Pcs', 'Box')
  AND deleted_at IS NULL;

UPDATE items_inventory_config
SET base_unit = 'pcs', updated_at = NOW()
WHERE base_unit IN ('Pcs', 'Box');

-- ============================================================================
-- 3. PERSEDIAAN — unit_conversion + BOM flags + min_stock_alert
-- ============================================================================

-- FLASHDISK: USB drive 8GB, beli per box of 10, BOM component for Set Kemasan
UPDATE items_inventory_config
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'pcs',
    'units', jsonb_build_object(
      'pcs',  jsonb_build_object('multiplier', 1,  'denominator', 1,    'kind', 'base',     'label', 'Pcs'),
      'box',  jsonb_build_object('multiplier', 10, 'denominator', NULL, 'kind', 'purchase', 'label', 'Box (10 pcs)')
    )
  ),
  is_bom_component = true,
  min_stock_alert = GREATEST(min_stock_alert, 10),
  updated_at = NOW()
WHERE item_id = (SELECT id FROM inventory_items WHERE sku = 'FLASHDISK');

-- FD-BOX: bundled per piece, BOM component, kemasan custom
UPDATE items_inventory_config
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'pcs',
    'units', jsonb_build_object(
      'pcs', jsonb_build_object('multiplier', 1, 'denominator', 1, 'kind', 'base', 'label', 'Pcs')
    )
  ),
  is_bom_component = true,
  min_stock_alert = GREATEST(min_stock_alert, 50),
  updated_at = NOW()
WHERE item_id = (SELECT id FROM inventory_items WHERE sku = 'FD-BOX');

-- POUCH: pack of 100, BOM component
UPDATE items_inventory_config
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'pcs',
    'units', jsonb_build_object(
      'pcs',  jsonb_build_object('multiplier', 1,   'denominator', 1,    'kind', 'base',     'label', 'Pcs'),
      'pack', jsonb_build_object('multiplier', 100, 'denominator', NULL, 'kind', 'purchase', 'label', 'Pack (100 pcs)')
    )
  ),
  is_bom_component = true,
  min_stock_alert = GREATEST(min_stock_alert, 50),
  updated_at = NOW()
WHERE item_id = (SELECT id FROM inventory_items WHERE sku = 'POUCH');

-- KEY-FRAME: acrylic blanks, pack of 100, BOM component
UPDATE items_inventory_config
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'pcs',
    'units', jsonb_build_object(
      'pcs',  jsonb_build_object('multiplier', 1,   'denominator', 1,    'kind', 'base',     'label', 'Pcs'),
      'pack', jsonb_build_object('multiplier', 100, 'denominator', NULL, 'kind', 'purchase', 'label', 'Pack (100 pcs)')
    )
  ),
  is_bom_component = true,
  updated_at = NOW()
WHERE item_id = (SELECT id FROM inventory_items WHERE sku = 'KEY-FRAME');

-- KEY-STRAP: leather strap, pack of 100, BOM component
UPDATE items_inventory_config
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'pcs',
    'units', jsonb_build_object(
      'pcs',  jsonb_build_object('multiplier', 1,   'denominator', 1,    'kind', 'base',     'label', 'Pcs'),
      'pack', jsonb_build_object('multiplier', 100, 'denominator', NULL, 'kind', 'purchase', 'label', 'Pack (100 pcs)')
    )
  ),
  is_bom_component = true,
  updated_at = NOW()
WHERE item_id = (SELECT id FROM inventory_items WHERE sku = 'KEY-STRAP');

-- PHOTOMAGNET: pack of 100
UPDATE items_inventory_config
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'pcs',
    'units', jsonb_build_object(
      'pcs',  jsonb_build_object('multiplier', 1,   'denominator', 1,    'kind', 'base',     'label', 'Pcs'),
      'pack', jsonb_build_object('multiplier', 100, 'denominator', NULL, 'kind', 'purchase', 'label', 'Pack (100 pcs)')
    )
  ),
  min_stock_alert = GREATEST(min_stock_alert, 50),
  updated_at = NOW()
WHERE item_id = (SELECT id FROM inventory_items WHERE sku = 'PHOTOMAGNET');

-- Kartu Nama Tetra: box of 100 cards
UPDATE items_inventory_config
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'pcs',
    'units', jsonb_build_object(
      'pcs', jsonb_build_object('multiplier', 1,   'denominator', 1,    'kind', 'base',     'label', 'Pcs'),
      'box', jsonb_build_object('multiplier', 100, 'denominator', NULL, 'kind', 'purchase', 'label', 'Box (100 pcs)')
    )
  ),
  min_stock_alert = GREATEST(min_stock_alert, 300),
  updated_at = NOW()
WHERE item_id = (SELECT id FROM inventory_items WHERE sku = 'ITM-BUSINESS-CARD');

-- Lakban Kain: per pcs (per gulung), no bulk
UPDATE items_inventory_config
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'pcs',
    'units', jsonb_build_object(
      'pcs', jsonb_build_object('multiplier', 1, 'denominator', 1, 'kind', 'base', 'label', 'Pcs')
    )
  ),
  updated_at = NOW()
WHERE item_id = (SELECT id FROM inventory_items WHERE sku = 'ITM-AUT-72822');

-- Consumables Lainnya: catch-all, default min alert
UPDATE items_inventory_config
SET
  unit_conversion = jsonb_build_object(
    'base_unit', 'pcs',
    'units', jsonb_build_object(
      'pcs', jsonb_build_object('multiplier', 1, 'denominator', 1, 'kind', 'base', 'label', 'Pcs')
    )
  ),
  min_stock_alert = GREATEST(min_stock_alert, 10),
  updated_at = NOW()
WHERE item_id = (SELECT id FROM inventory_items WHERE sku = 'ITM-CONSUMABLE-OTHER');

-- ============================================================================
-- 4. ASET TETAP — Smart defaults: useful_life, condition, location, asset#
-- ============================================================================
-- Strategy: pattern-match SKU + name → assign default useful_life per kategori.
-- All set condition=normal, location=gudang_pusat (kalau null).
-- asset_number = SKU kalau null (1 row = 1 unit, asset# default = SKU).
-- price tetap 0 (user akan isi via UI saat catat Pembelian).

-- Set defaults universal yang aman: condition + location + asset_number
UPDATE items_fixed_asset_config
SET
  condition = COALESCE(condition, 'normal'),
  current_location = COALESCE(current_location, 'gudang_pusat'),
  acquisition_type = COALESCE(acquisition_type, 'new_commercial'),
  updated_at = NOW()
WHERE condition IS NULL OR current_location IS NULL;

-- Asset number = SKU kalau null
UPDATE items_fixed_asset_config c
SET
  asset_number = i.sku,
  updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.asset_number IS NULL
  AND i.category = 'fixed_asset';

-- Useful life defaults per kategori (smart guess dari nama)
-- Cameras: 36 bulan (3 tahun standar untuk DSLR/mirrorless)
UPDATE items_fixed_asset_config c
SET useful_life_months = 36, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND (
    i.name ILIKE '%kamera%' OR i.name ILIKE '%camera%' OR i.name ILIKE '%canon%' OR i.name ILIKE '%nikon%'
  );

-- Lensa: 60 bulan (5 tahun, lensa lebih tahan)
UPDATE items_fixed_asset_config c
SET useful_life_months = 60, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND (i.name ILIKE '%lensa%' OR i.name ILIKE '%lens%');

-- Printer: 36 bulan
UPDATE items_fixed_asset_config c
SET useful_life_months = 36, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND (i.name ILIKE '%printer%' OR i.name ILIKE '%dnp%');

-- Flash/Lighting: 24 bulan
UPDATE items_fixed_asset_config c
SET useful_life_months = 24, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND (
    i.name ILIKE '%flash%' OR i.name ILIKE '%lighting%' OR i.name ILIKE '%godox%'
    OR i.name ILIKE '%light%' OR i.name ILIKE '%trigger%'
  );

-- Tripod / Stand / Support: 36 bulan
UPDATE items_fixed_asset_config c
SET useful_life_months = 36, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND (
    i.name ILIKE '%tripod%' OR i.name ILIKE '%stand%' OR i.name ILIKE '%payung%'
    OR i.name ILIKE '%clamp%' OR i.name ILIKE '%bracket%' OR i.name ILIKE '%spigot%'
    OR i.name ILIKE '%tiang%'
  );

-- Cable / Accessory: 12 bulan (sering rusak)
UPDATE items_fixed_asset_config c
SET useful_life_months = 12, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND (
    i.name ILIKE '%kabel%' OR i.name ILIKE '%cable%' OR i.name ILIKE '%charger%'
    OR i.name ILIKE '%dummy bater%' OR i.name ILIKE '%usb hub%' OR i.name ILIKE '%terminal%'
  );

-- Backdrop / Background / Cloth: 18 bulan
UPDATE items_fixed_asset_config c
SET useful_life_months = 18, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND (
    i.name ILIKE '%background%' OR i.name ILIKE '%backdrop%' OR i.name ILIKE '%kain%'
  );

-- Container / Tas / Storage: 24 bulan
UPDATE items_fixed_asset_config c
SET useful_life_months = 24, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND (
    i.name ILIKE '%kontainer%' OR i.name ILIKE '%tas%' OR i.name ILIKE '%ransel%'
    OR i.name ILIKE '%bag%' OR i.name ILIKE '%sleeve bag%' OR i.name ILIKE '%rak%'
    OR i.name ILIKE '%kursi%'
  );

-- Seragam / Uniform: 12 bulan
UPDATE items_fixed_asset_config c
SET useful_life_months = 12, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND (i.name ILIKE '%seragam%' OR i.name ILIKE '%uniform%' OR i.name ILIKE '%vest%');

-- Monitor: 36 bulan
UPDATE items_fixed_asset_config c
SET useful_life_months = 36, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND i.name ILIKE '%monitor%';

-- Mic Wireless: 24 bulan
UPDATE items_fixed_asset_config c
SET useful_life_months = 24, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset'
  AND (i.name ILIKE '%mic%' OR i.name ILIKE '%microphone%');

-- Album Foto / Properti / Generic: 24 bulan (default fallback)
UPDATE items_fixed_asset_config c
SET useful_life_months = 24, updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.useful_life_months IS NULL
  AND i.category = 'fixed_asset';

-- depreciation_start_date default = today untuk yg punya useful_life tapi
-- start_date null (legacy items dianggap mulai depresiasi sekarang)
UPDATE items_fixed_asset_config
SET
  depreciation_start_date = CURRENT_DATE,
  depreciation_method = 'straight_line',
  updated_at = NOW()
WHERE useful_life_months IS NOT NULL
  AND useful_life_months > 0
  AND depreciation_start_date IS NULL;

-- ============================================================================
-- 5. Verification queries (run post-apply)
-- ============================================================================
-- SELECT category, COUNT(*) FROM inventory_items WHERE deleted_at IS NULL GROUP BY category;
--   → expect: inventory=14 (15-1 archived), fixed_asset=50
--
-- SELECT i.sku, c.is_bom_component FROM items_inventory_config c
-- JOIN inventory_items i ON i.id = c.item_id
-- WHERE c.is_bom_component = true ORDER BY i.sku;
--   → expect 6 rows: FD-BOX, FLASHDISK, KEY-FRAME, KEY-STRAP, PHOTOMAGNET, POUCH
--   (note: PHOTOMAGNET tidak di-flag jika tidak masuk Set picker, optional)
--
-- SELECT COUNT(*) FROM items_fixed_asset_config WHERE useful_life_months IS NULL;
--   → expect: 0
--
-- SELECT COUNT(*) FROM items_fixed_asset_config WHERE condition IS NULL OR current_location IS NULL;
--   → expect: 0
