-- 20260626_addon_components.sql
-- Multi-item consumption untuk add-on. Sebelumnya `addons.inventory_item_id`
-- cuma bisa link 1 item (auto-deduct 1 SKU per add-on). Sekarang satu add-on
-- bisa consume BANYAK item (mis. Guest Book = 1 Scrapbook + 1 Spidol).
--
-- Planner (projectEventLinesFromSpec) baca tabel ini; kalau add-on TIDAK punya
-- baris di sini, fallback ke kolom legacy `addons.inventory_item_id` (tanpa
-- regresi). Kolom legacy dipertahankan utk back-compat + display lama.

CREATE TABLE IF NOT EXISTS addon_components (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id          uuid NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
  qty_per_unit      numeric(12,4) NOT NULL DEFAULT 1 CHECK (qty_per_unit > 0),
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (addon_id, inventory_item_id)
);

COMMENT ON TABLE addon_components IS
  'Komponen inventory yang dikonsumsi per 1 unit add-on (1 add-on = N item). Dibaca planner consumption; fallback ke addons.inventory_item_id kalau kosong.';

CREATE INDEX IF NOT EXISTS idx_addon_components_addon ON addon_components(addon_id);

-- Backfill: setiap add-on yang sudah punya link legacy → 1 baris komponen (qty 1).
INSERT INTO addon_components (addon_id, inventory_item_id, qty_per_unit, sort_order)
SELECT id, inventory_item_id, 1, 0
FROM addons
WHERE inventory_item_id IS NOT NULL AND deleted_at IS NULL
ON CONFLICT (addon_id, inventory_item_id) DO NOTHING;

ALTER TABLE addon_components ENABLE ROW LEVEL SECURITY;

-- Crew + owner boleh BACA (planner butuh saat approve rekap + forecast).
DROP POLICY IF EXISTS addon_components_read ON addon_components;
CREATE POLICY addon_components_read ON addon_components
  FOR SELECT TO authenticated USING (true);

-- Hanya owner/super_admin boleh UBAH.
DROP POLICY IF EXISTS addon_components_write ON addon_components;
CREATE POLICY addon_components_write ON addon_components
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('owner','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('owner','super_admin')));
