-- 20260529_inventory_preferred_supplier.sql
-- ============================================================================
-- Persediaan: preferred_supplier_id (Supplier Utama)
-- ============================================================================
--
-- WHY:
--   Saat catat pembelian (Pembelian module), supplier biasanya konsisten
--   per item (mis. MEDIA-BASIC selalu beli dari "PT Media Cetak Indonesia").
--   Field ini default-isi supplier picker di form Pembelian → kurangi
--   typo + speed up flow.
--
--   Berbeda dari Market List yg tracking multi-supplier per item dengan
--   harga + Primary flag. `preferred_supplier_id` hanya pointer "default
--   pick" untuk UI form (bisa di-override per pembelian).
--
-- ADDITIVE, IDEMPOTENT — safe re-run.

ALTER TABLE items_inventory_config
  ADD COLUMN IF NOT EXISTS preferred_supplier_id UUID NULL
    REFERENCES suppliers(id) ON DELETE SET NULL;

COMMENT ON COLUMN items_inventory_config.preferred_supplier_id IS
  'Supplier default yang akan auto-pick di form Pembelian. NULL = belum di-set. Bukan constraint — pembelian boleh dari supplier lain.';

CREATE INDEX IF NOT EXISTS idx_items_inventory_preferred_supplier
  ON items_inventory_config(preferred_supplier_id)
  WHERE preferred_supplier_id IS NOT NULL;
