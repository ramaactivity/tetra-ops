-- 20260528_inventory_bom_ready.sql
-- ============================================================================
-- Add BOM-component flag to inventory config + index
-- ============================================================================
--
-- WHY:
--   User-facing form akan punya toggle "Dapat digunakan sebagai komponen
--   Bundle / BOM". Ini menyiapkan schema untuk modul Bill of Materials yg
--   akan dibikin setelah pattern Tambah Item stable. Item yg di-flag ini
--   nanti muncul di picker komponen saat owner susun bundle (mis. "Set
--   Flashdisk Kemasan" = 1 FLASHDISK + 1 FD-BOX + 1 POUCH).
--
-- ADDITIVE, IDEMPOTENT — safe re-run.

ALTER TABLE items_inventory_config
  ADD COLUMN IF NOT EXISTS is_bom_component BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN items_inventory_config.is_bom_component IS
  'Flag: item ini bisa dijadikan komponen di Bill of Materials (Bundle/Combo). Default false. Modul BOM akan filter picker hanya item dengan flag=true.';

CREATE INDEX IF NOT EXISTS idx_items_inventory_bom_component
  ON items_inventory_config(is_bom_component) WHERE is_bom_component = true;
