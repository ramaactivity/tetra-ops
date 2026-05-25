-- 20260530_item_bundles.sql
-- ============================================================================
-- Item Bundles / Bill of Materials (BOM)
-- ============================================================================
--
-- WHY:
--   Owner sering kirim "set kemasan" ke klien: 1 FLASHDISK + 1 FD-BOX + 1 POUCH
--   sebagai 1 paket. Daripada catat masing-masing di rekap event, kita
--   define BUNDLE sebagai recipe (parent SKU + komponen list + qty).
--
--   Bundle TIDAK punya stok sendiri — dia adalah resep. Saat event pakai
--   1 unit bundle, sistem otomatis deduct komponennya. Fase ini cuma
--   bikin schema + UI manajemen bundle. Integrasi ke rekap = fase berikut.
--
-- IDEMPOTENT — safe re-run.

-- ============================================================================
-- 1. item_bundles — header tabel
-- ============================================================================

CREATE TABLE IF NOT EXISTS item_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT bundle_sku_format CHECK (sku ~ '^[A-Z0-9_-]+$')
);

COMMENT ON TABLE item_bundles IS
  'Bundle / Bill of Materials parent. Tidak punya stok — adalah recipe yang resolve ke komponen saat dipakai event.';

CREATE INDEX IF NOT EXISTS idx_item_bundles_active
  ON item_bundles(is_active) WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. bundle_components — line items per bundle
-- ============================================================================

CREATE TABLE IF NOT EXISTS bundle_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES item_bundles(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  qty NUMERIC(14, 4) NOT NULL CHECK (qty > 0),
  line_order INTEGER NOT NULL DEFAULT 1,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bundle_id, item_id)
);

COMMENT ON TABLE bundle_components IS
  'Komponen per bundle. qty = berapa unit base item dideduct per 1 unit bundle. UNIQUE (bundle_id, item_id) — 1 item maksimal 1x per bundle.';

CREATE INDEX IF NOT EXISTS idx_bundle_components_bundle
  ON bundle_components(bundle_id);
CREATE INDEX IF NOT EXISTS idx_bundle_components_item
  ON bundle_components(item_id);

-- ============================================================================
-- 3. RLS — owner-level only
-- ============================================================================

ALTER TABLE item_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_components ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "item_bundles_owner_all" ON item_bundles
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bundle_components_owner_all" ON bundle_components
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Verification queries (run post-apply)
-- ============================================================================
-- SELECT count(*) FROM item_bundles; -- 0
-- SELECT count(*) FROM bundle_components; -- 0
