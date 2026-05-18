-- 20260520_package_items_mapping.sql
-- Mapping package → consumable items yang INCLUDED dalam harga paket.
-- Setting ini di-config owner di Settings → Packages → Items.
--
-- Use case:
--   • Saat booking dibuat dengan package X, sistem tahu items apa yang termasuk.
--   • Saat rekap submit, sistem bisa pre-fill expected consumption.
--   • Untuk HPP calculation: bedakan item INCLUDED (sudah price-in ke package) vs ADD-ON paid separately.
--
-- quantity_per_event = decimal supaya bisa fractional (mis. 0.5 flashdisk = 1 flashdisk per 2 event)
-- is_included = false bermakna item ini bisa di-pesan via package tapi di-charge terpisah.

CREATE TABLE IF NOT EXISTS package_items_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,

  quantity_per_event NUMERIC(8, 3) NOT NULL,  -- support fractional
  is_included BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT package_item_qty_positive CHECK (quantity_per_event > 0),
  UNIQUE (package_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_package_items_package ON package_items_mapping(package_id);
CREATE INDEX IF NOT EXISTS idx_package_items_item ON package_items_mapping(item_id);

COMMENT ON TABLE package_items_mapping IS
  'Per-package consumable items mapping. Owner config di Settings. Used untuk pre-fill rekap & HPP analysis.';
COMMENT ON COLUMN package_items_mapping.quantity_per_event IS
  'Expected qty consumed per event. Fractional allowed (e.g., 0.5 flashdisk).';
COMMENT ON COLUMN package_items_mapping.is_included IS
  'true = sudah price-in ke package base_price (no extra charge). false = available via package tapi di-charge terpisah.';

CREATE TRIGGER trg_package_items_mapping_updated_at
  BEFORE UPDATE ON package_items_mapping
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Verification:
--   SELECT p.name AS package, i.name AS item, pim.quantity_per_event, pim.is_included
--   FROM package_items_mapping pim
--   JOIN packages p ON p.id = pim.package_id
--   JOIN inventory_items i ON i.id = pim.item_id
--   ORDER BY p.name, i.name;
