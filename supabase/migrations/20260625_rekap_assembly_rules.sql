-- 20260625_rekap_assembly_rules.sql
-- B — Assembly data-driven. Memindahkan resep "1 unit rekap → N komponen
-- inventory" (flashdisk = unit+box+pouch, keychain = frame+strap, dst) dari
-- hardcode di kode ke tabel yang bisa diatur owner. Planner baca dari sini;
-- kalau tabel kosong/error → fallback ke hardcode (tak ada regresi).

CREATE TABLE IF NOT EXISTS rekap_assembly_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rekap_field   text NOT NULL,         -- flashdisk_used, pouch_used, photomagnet_used, keychain_used
  component_sku text NOT NULL,         -- SKU inventory yang dikurangi
  qty_per_unit  numeric NOT NULL DEFAULT 1 CHECK (qty_per_unit > 0),
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rekap_field, component_sku)
);

COMMENT ON TABLE rekap_assembly_rules IS
  'Resep konsumsi per field rekap → komponen inventory (1 unit = N SKU). Owner-editable. Planner planRekapDeduction baca ini, fallback hardcode kalau kosong.';

-- Seed = resep saat ini (idempotent).
INSERT INTO rekap_assembly_rules (rekap_field, component_sku, qty_per_unit, sort_order) VALUES
  ('flashdisk_used',  'FLASHDISK',   1, 0),
  ('flashdisk_used',  'FD-BOX',      1, 1),
  ('flashdisk_used',  'POUCH',       1, 2),
  ('pouch_used',      'POUCH',       1, 0),
  ('photomagnet_used','PHOTOMAGNET', 1, 0),
  ('keychain_used',   'KEY-FRAME',   1, 0),
  ('keychain_used',   'KEY-STRAP',   1, 1)
ON CONFLICT (rekap_field, component_sku) DO NOTHING;

ALTER TABLE rekap_assembly_rules ENABLE ROW LEVEL SECURITY;

-- Crew + owner boleh BACA (planner butuh saat approve rekap).
DROP POLICY IF EXISTS rekap_assembly_read ON rekap_assembly_rules;
CREATE POLICY rekap_assembly_read ON rekap_assembly_rules
  FOR SELECT TO authenticated USING (true);

-- Hanya owner/super_admin boleh UBAH.
DROP POLICY IF EXISTS rekap_assembly_write ON rekap_assembly_rules;
CREATE POLICY rekap_assembly_write ON rekap_assembly_rules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('owner','super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('owner','super_admin')));
