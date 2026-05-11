-- 20260517_addons_inventory_link.sql
-- Tambah FK addons → inventory_items biar bisa auto-deduct stock
-- saat rekap approved (untuk add-ons real maupun event_bonuses).
--
-- Sebelumnya addon adalah entry harga standalone, tidak punya hubungan
-- ke inventory. Sekarang owner bisa link addon ke item inventory
-- (cth. "Photomagnet" addon → "MAG-50PC" inventory item) sehingga:
--   • Bonus dengan addon photomagnet → deduct stok MAG-50PC saat rekap
--   • HPP report bisa hitung freebie cost berdasarkan purchase_price_avg
--
-- Link bersifat opsional — addon tanpa inventory_item tidak akan
-- ter-deduct (no-op, sama seperti sebelum migration ini).
--
-- Idempotent.

ALTER TABLE addons
    ADD COLUMN IF NOT EXISTS inventory_item_id UUID
        REFERENCES inventory_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_addons_inventory_item
    ON addons(inventory_item_id)
    WHERE inventory_item_id IS NOT NULL;

COMMENT ON COLUMN addons.inventory_item_id IS
    'Optional link ke inventory_items. Kalau di-set, rekap approval bakal auto-deduct stok untuk add-on real consumption + bonus (event_bonuses). NULL = no stock tracking untuk addon ini.';
