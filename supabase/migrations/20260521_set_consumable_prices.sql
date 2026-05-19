-- 20260521_set_consumable_prices.sql
-- ============================================================================
-- Set purchase_price_avg untuk consumable items yang dipakai rekap_field_mapping.
-- ============================================================================
--
-- Akar masalah:
--   rekap_field_mapping point ke SKU baru (MEDIA-BASIC, SLEEVE-2R, dll) yang
--   purchase_price_avg = 0. Akibatnya calculate_recap_hpp() return semua 0
--   walaupun consumption tracked benar. HPP di settlement selalu Rp 0.
--
--   Ada SKU pasangan "ITM-*" (ITM-PCS-4R, ITM-SLEEVE-2R, dll) di inventory
--   yang sudah ada harga. Migration ini transfer harga dari ITM-* ke SKU baru.
--   KEYCHAIN + PHOTOMAGNET tidak ada pasangan ITM-* — pakai user-provided estimate.
--
-- Strategi: simple UPDATE per SKU. Idempotent (re-run safe karena harga tetap value).
-- Backward compatible — tidak ubah schema, hanya data.

-- Mediaset & Sleeve (sesuai harga ITM-PCS-* dan ITM-SLEEVE-*)
UPDATE inventory_items SET purchase_price_avg = 941, updated_at = NOW()
  WHERE sku = 'MEDIA-BASIC';

UPDATE inventory_items SET purchase_price_avg = 1100, updated_at = NOW()
  WHERE sku = 'MEDIA-PERF';

UPDATE inventory_items SET purchase_price_avg = 500, updated_at = NOW()
  WHERE sku IN ('SLEEVE-2R', 'SLEEVE-4R', 'SLEEVE-PR');

-- Flashdisk + Box Custom (sesuai harga ITM-FLASHDISK)
UPDATE inventory_items SET purchase_price_avg = 75000, updated_at = NOW()
  WHERE sku = 'FLASHDISK';

-- Pouch (sesuai harga ITM-POUCH-TOTEBAG)
UPDATE inventory_items SET purchase_price_avg = 1000, updated_at = NOW()
  WHERE sku = 'POUCH';

-- Keychain — user-confirmed Rp 3.000 (acrylic frame Rp 1.000 + leather strap Rp 2.000)
UPDATE inventory_items SET purchase_price_avg = 3000, updated_at = NOW()
  WHERE sku = 'KEYCHAIN';

-- Photomagnet — user-confirmed Rp 7.000 (medium estimate)
UPDATE inventory_items SET purchase_price_avg = 7000, updated_at = NOW()
  WHERE sku = 'PHOTOMAGNET';

-- Verification query (run setelah apply):
-- SELECT sku, name, purchase_price_avg FROM inventory_items
-- WHERE sku IN ('MEDIA-BASIC','MEDIA-PERF','SLEEVE-2R','SLEEVE-4R','SLEEVE-PR',
--               'FLASHDISK','POUCH','KEYCHAIN','PHOTOMAGNET')
-- ORDER BY sku;
