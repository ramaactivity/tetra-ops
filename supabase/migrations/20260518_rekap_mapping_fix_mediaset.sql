-- 20260518_rekap_mapping_fix_mediaset.sql
-- Switch media_set_used mappings dari placeholder MEDIA-BASIC/MEDIA-PERF
-- (yang di-seed 20260518) ke SKU asli yang Rama sudah punya di inventory:
--   • ITM-BOX-4R — Box DNP Basic (4R/2R), 1 box = 1400 lembar 4R
--   • ITM-BOX-POL — Box DNP Perforated (Polaroid), 1 box = 1400 lembar fisik
--                  (yields 2800 prints polaroid karena perforated cut)
--
-- Semantic: inventory unit = LEMBAR (granular). qty_per_unit:
--   - 4R: 1.0 lembar / 1 cetak 4R
--   - 2R: 0.5 lembar / 1 cetak 2R (cut: 1 lembar basic → 2 prints 2R)
--   - polaroid: 0.5 lembar / 1 cetak polaroid (perforated cut: 1 lembar perf → 2 prints)
--
-- Migration steps:
-- 1. Set inventory_items.unit = 'lembar' for ITM-BOX-4R + ITM-BOX-POL
--    (kalau current unit beda — defensive update)
-- 2. UPDATE rekap_field_mapping media_set_used rows to point at ITM-BOX-*
-- 3. Soft-delete placeholder MEDIA-BASIC + MEDIA-PERF (is_active=false +
--    deleted_at=now) — kalau item ID-nya ditemukan
--
-- IDEMPOTENT — bisa di-run ulang aman.

-- 1. Pastikan ITM-BOX-* unit = 'lembar' supaya stock tracking konsisten
UPDATE inventory_items
SET unit = 'lembar'
WHERE sku IN ('ITM-BOX-4R', 'ITM-BOX-POL')
	AND unit IS DISTINCT FROM 'lembar';

-- 2. Switch mediaset mappings to real SKUs
UPDATE rekap_field_mapping
SET item_id = (SELECT id FROM inventory_items WHERE sku = 'ITM-BOX-4R'),
		qty_per_unit = 1.0,
		updated_at = NOW()
WHERE rekap_field = 'media_set_used' AND frame_size = '4R'
	AND EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'ITM-BOX-4R');

UPDATE rekap_field_mapping
SET item_id = (SELECT id FROM inventory_items WHERE sku = 'ITM-BOX-4R'),
		qty_per_unit = 0.5,
		updated_at = NOW()
WHERE rekap_field = 'media_set_used' AND frame_size = '2R'
	AND EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'ITM-BOX-4R');

UPDATE rekap_field_mapping
SET item_id = (SELECT id FROM inventory_items WHERE sku = 'ITM-BOX-POL'),
		qty_per_unit = 0.5,
		updated_at = NOW()
WHERE rekap_field = 'media_set_used' AND frame_size = 'polaroid'
	AND EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'ITM-BOX-POL');

-- 3. Soft-delete duplicate placeholder seeds (MEDIA-BASIC + MEDIA-PERF)
-- karena ITM-BOX-* sudah cover semantic-nya. Set deleted_at + is_active=false
-- supaya nggak muncul lagi di dropdown picker tapi history tetap traceable.
UPDATE inventory_items
SET is_active = false,
		deleted_at = NOW()
WHERE sku IN ('MEDIA-BASIC', 'MEDIA-PERF')
	AND deleted_at IS NULL;
