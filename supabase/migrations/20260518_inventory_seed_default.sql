-- 20260518_inventory_seed_default.sql
-- Seed 9 default consumable inventory items if they don't exist. These
-- are the SKUs referenced by the default rekap_field_mapping rows
-- (20260518_rekap_mapping_seed.sql).
--
-- Owner will update purchase_price_avg via warehouse restock flow nanti.
-- For now placeholder = 0 so HPP shows 0 until first restock recorded.
--
-- Idempotent — uses INSERT ... WHERE NOT EXISTS pattern keyed on sku.

INSERT INTO inventory_items (sku, name, category, unit, purchase_price_avg, is_active)
SELECT
	v.sku,
	v.name,
	v.category::item_category, -- cast TEXT literal to enum
	v.unit,
	v.purchase_price_avg,
	v.is_active
FROM (VALUES
	('MEDIA-BASIC',  'Mediaset Basic (4R/2R)',        'consumable', 'lembar', 0, true),
	('MEDIA-PERF',   'Mediaset Perforated (Polaroid)', 'consumable', 'lembar', 0, true),
	('SLEEVE-4R',    'Sleeve 4R',                      'consumable', 'pcs',    0, true),
	('SLEEVE-2R',    'Sleeve 2R',                      'consumable', 'pcs',    0, true),
	('SLEEVE-PR',    'Sleeve Polaroid',                'consumable', 'pcs',    0, true),
	('FLASHDISK',    'Flashdisk',                      'consumable', 'pcs',    0, true),
	('POUCH',        'Pouch Flashdisk',                'consumable', 'pcs',    0, true),
	('PHOTOMAGNET',  'Photomagnet',                    'consumable', 'pcs',    0, true),
	('KEYCHAIN',     'Keychain Foto',                  'consumable', 'pcs',    0, true)
) AS v(sku, name, category, unit, purchase_price_avg, is_active)
WHERE NOT EXISTS (
	SELECT 1 FROM inventory_items i WHERE i.sku = v.sku
);

COMMENT ON COLUMN inventory_items.purchase_price_avg IS
	'Weighted-average cost per inventory unit (lembar/pcs). Updated on each restock via apply_purchase_movement RPC. Used by getAutoHpp + planRekapDeduction.';
