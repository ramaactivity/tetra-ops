-- 20260611_media_lembar_unit.sql
-- Tambah satuan konsumsi "lembar" yang SERAGAM ke media (MEDIA-BASIC & MEDIA-PERF):
-- 1 roll = 1400 lembar. Lembar = potongan terkecil (ukuran 2R/polaroid).
--   - 2R     : 1 cetak = 1 lembar
--   - polaroid: 1 cetak = 1 lembar (sama ukuran 2R, beda orientasi/kertas perforated)
--   - 4R     : 1 cetak = 2 lembar
-- MEDIA-PERF: ganti "lembar_polaroid" lama jadi "lembar" biar konsisten.
--
-- Base unit TETAP roll (stok & avg cost tetap per roll; planner deduct roll).
-- Ini cuma nambah satuan tampilan terkecil di halaman item + dipakai form rekap.
-- Update DUA tempat: inventory_items (base, dibaca planner) + items_inventory_config
-- (satellite, dibaca item-loader/halaman edit item).

DO $$
DECLARE
  v_basic JSONB := '{"base_unit":"roll","units":{"box":{"kind":"purchase","label":"Box (2 Roll)","multiplier":2,"denominator":null},"roll":{"kind":"base","label":"Roll","multiplier":1,"denominator":1},"lembar":{"kind":"consumption","label":"Lembar","multiplier":null,"denominator":1400}}}'::jsonb;
  v_perf  JSONB := '{"base_unit":"roll","units":{"box":{"kind":"purchase","label":"Box (2 Roll)","multiplier":2,"denominator":null},"roll":{"kind":"base","label":"Roll","multiplier":1,"denominator":1},"lembar":{"kind":"consumption","label":"Lembar","multiplier":null,"denominator":1400}}}'::jsonb;
  v_basic_id UUID;
  v_perf_id  UUID;
BEGIN
  SELECT id INTO v_basic_id FROM inventory_items WHERE sku = 'MEDIA-BASIC';
  SELECT id INTO v_perf_id  FROM inventory_items WHERE sku = 'MEDIA-PERF';

  IF v_basic_id IS NOT NULL THEN
    UPDATE inventory_items SET unit_conversion = v_basic WHERE id = v_basic_id;
    UPDATE items_inventory_config SET unit_conversion = v_basic WHERE item_id = v_basic_id;
  END IF;
  IF v_perf_id IS NOT NULL THEN
    UPDATE inventory_items SET unit_conversion = v_perf WHERE id = v_perf_id;
    UPDATE items_inventory_config SET unit_conversion = v_perf WHERE item_id = v_perf_id;
  END IF;
END $$;
