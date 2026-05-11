-- 20260518_rekap_mapping_fix_defaults.sql
-- Backfill item_id pada default rows (frame_size = '') yang dibuat oleh
-- seed Phase 11 dengan item_id=NULL. Migration seed 20260518 pakai
-- ON CONFLICT DO NOTHING sehingga old NULL rows nggak ter-overwrite.
--
-- Strategi: hanya UPDATE rows yang item_id-nya MASIH NULL — jika owner
-- sudah pernah set manual via /settings, kita tidak ganggu.
--
-- Idempotent.

UPDATE rekap_field_mapping
SET item_id = (SELECT id FROM inventory_items WHERE sku = 'FLASHDISK'),
    qty_per_unit = 1.0,
    updated_at = NOW()
WHERE rekap_field = 'flashdisk_used'
  AND frame_size = ''
  AND item_id IS NULL;

UPDATE rekap_field_mapping
SET item_id = (SELECT id FROM inventory_items WHERE sku = 'POUCH'),
    qty_per_unit = 1.0,
    updated_at = NOW()
WHERE rekap_field = 'pouch_used'
  AND frame_size = ''
  AND item_id IS NULL;

UPDATE rekap_field_mapping
SET item_id = (SELECT id FROM inventory_items WHERE sku = 'PHOTOMAGNET'),
    qty_per_unit = 1.0,
    updated_at = NOW()
WHERE rekap_field = 'photomagnet_used'
  AND frame_size = ''
  AND item_id IS NULL;

UPDATE rekap_field_mapping
SET item_id = (SELECT id FROM inventory_items WHERE sku = 'KEYCHAIN'),
    qty_per_unit = 1.0,
    updated_at = NOW()
WHERE rekap_field = 'keychain_used'
  AND frame_size = ''
  AND item_id IS NULL;

-- cetak_total, media_set_used, sleeve_used at frame_size = '' tetap NULL —
-- size-specific override rows (4R/2R/polaroid) yang handle deduksi mereka.
-- Default '' rows-nya bertahan sebagai fallback "no mapping kalau frame_size
-- nggak match", which behaves as expected (no deduct).
