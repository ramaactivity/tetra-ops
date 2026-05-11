-- 20260518_rekap_mapping_seed.sql
-- Seed default frame-size-aware mappings based on real-world photobooth
-- consumables logic:
--   • Mediaset Basic: 1 sheet = 1 print 4R = 2 prints 2R (cut)
--   • Mediaset Perforated: 1 sheet = 2 prints polaroid (perforated cut)
--   • Sleeve per size: 1:1 with prints
--   • Flashdisk/Pouch/Photomagnet/Keychain: size-agnostic, 1:1
--
-- Idempotent — ON CONFLICT DO NOTHING so existing custom mappings won't
-- be overwritten. Depends on 20260518_rekap_mapping_frame_size.sql (composite PK)
-- and 20260518_inventory_seed_default.sql (SKUs exist).
--
-- Each row inserts only if (rekap_field, frame_size) combo doesn't exist.

WITH item_ids AS (
	SELECT
		(SELECT id FROM inventory_items WHERE sku = 'MEDIA-BASIC') AS media_basic,
		(SELECT id FROM inventory_items WHERE sku = 'MEDIA-PERF') AS media_perf,
		(SELECT id FROM inventory_items WHERE sku = 'SLEEVE-4R')  AS sleeve_4r,
		(SELECT id FROM inventory_items WHERE sku = 'SLEEVE-2R')  AS sleeve_2r,
		(SELECT id FROM inventory_items WHERE sku = 'SLEEVE-PR')  AS sleeve_pr,
		(SELECT id FROM inventory_items WHERE sku = 'FLASHDISK')  AS flashdisk,
		(SELECT id FROM inventory_items WHERE sku = 'POUCH')      AS pouch,
		(SELECT id FROM inventory_items WHERE sku = 'PHOTOMAGNET') AS photomagnet,
		(SELECT id FROM inventory_items WHERE sku = 'KEYCHAIN')   AS keychain
)
INSERT INTO rekap_field_mapping (rekap_field, frame_size, item_id, qty_per_unit, is_active)
SELECT * FROM (VALUES
	-- media_set_used: size-specific (basic for 4R/2R, perforated for polaroid)
	('media_set_used', '4R',       (SELECT media_basic FROM item_ids), 1.0,  true),
	('media_set_used', '2R',       (SELECT media_basic FROM item_ids), 0.5,  true),
	('media_set_used', 'polaroid', (SELECT media_perf  FROM item_ids), 0.5,  true),

	-- sleeve_used: size-specific (matching sleeve SKU per size, 1:1 ratio)
	('sleeve_used',    '4R',       (SELECT sleeve_4r FROM item_ids),  1.0,  true),
	('sleeve_used',    '2R',       (SELECT sleeve_2r FROM item_ids),  1.0,  true),
	('sleeve_used',    'polaroid', (SELECT sleeve_pr FROM item_ids),  1.0,  true),

	-- Size-agnostic (frame_size = '' fallback)
	('flashdisk_used',   '',  (SELECT flashdisk    FROM item_ids), 1.0, true),
	('pouch_used',       '',  (SELECT pouch        FROM item_ids), 1.0, true),
	('photomagnet_used', '',  (SELECT photomagnet  FROM item_ids), 1.0, true),
	('keychain_used',    '',  (SELECT keychain     FROM item_ids), 1.0, true)
) AS v(rekap_field, frame_size, item_id, qty_per_unit, is_active)
ON CONFLICT (rekap_field, frame_size) DO NOTHING;
