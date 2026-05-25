-- 20260526_item_ingestion_refactor.sql
-- ============================================================================
-- Item Ingestion Refactor — Phase A (additive, non-breaking)
-- ============================================================================
--
-- WHY:
--   `inventory_items` saat ini mencampur dua kelas akuntansi yang berbeda
--   (Persediaan/COGS vs Aktiva Tetap/CapEx) di satu tabel dengan kolom
--   nullable per kelas. Validasi rapuh, journal routing salah (kamera masuk
--   akun persediaan), depresiasi tidak ter-track.
--
--   Refactor ini PHASE A (additive only) — buat satellite tables + wastage
--   tracking + rename enum values. Tidak ada DROP / RENAME table di phase
--   ini, jadi semua code lama tetap jalan tanpa modifikasi. Phase B akan
--   refactor callsite + drop deprecated columns nanti.
--
-- DOKUMEN PLAN: ~/.claude/plans/saya-ingin-memperbaiki-sistem-deep-church.md
--
-- IDEMPOTENT — safe re-run.

-- ============================================================================
-- 1. ENUM additions & renames
-- ============================================================================

-- 1a. Add `wastage` to movement_source enum (for wastage stock-out)
ALTER TYPE movement_source ADD VALUE IF NOT EXISTS 'wastage';

-- 1b. Create wastage_reason enum for granular wastage classification
DO $$ BEGIN
  CREATE TYPE wastage_reason AS ENUM (
    'testing',              -- cetak tes sebelum event
    'defective_on_arrival', -- DOA dari supplier
    'handling_damage',      -- sobek/penyok saat handling
    'production_reject',    -- gagal cetak (paper jam, ink smear)
    'expired',              -- kadaluarsa
    'customer_returned',    -- dikembalikan klien
    'opname_shortage',      -- variance shortage dari opname
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1c. Rename category enum values (accounting-correct semantic)
--     consumable → inventory, equipment → fixed_asset
DO $$ BEGIN
  ALTER TYPE item_category RENAME VALUE 'consumable' TO 'inventory';
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN invalid_parameter_value THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE item_category RENAME VALUE 'equipment' TO 'fixed_asset';
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN invalid_parameter_value THEN NULL; END $$;

-- ============================================================================
-- 2. Chart of Accounts — wastage + gain-on-overage
-- ============================================================================

INSERT INTO chart_of_accounts (code, name, account_type, parent_code, is_active, description)
VALUES
  ('5-510', 'Beban Wastage / Kerugian Persediaan', 'expense', '5-000', true,
   'Loss dari testing waste, defective on arrival, handling damage, dll. Dipisah dari HPP normal supaya operational-efficiency metric terlihat.'),
  ('4-900', 'Pendapatan Stok Lebih (Opname Surplus)', 'revenue', '4-000', true,
   'Gain dari stock take variance positif. Selisih lebih hasil opname.')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 3. Satellite table — items_inventory_config (1:1 untuk category='inventory')
-- ============================================================================

CREATE TABLE IF NOT EXISTS items_inventory_config (
  item_id UUID PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
  base_unit TEXT NOT NULL,
  unit_conversion JSONB NOT NULL DEFAULT '{}'::jsonb,
  min_stock_alert INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_alert >= 0),
  purchase_price_avg BIGINT NOT NULL DEFAULT 0 CHECK (purchase_price_avg >= 0),
  selling_price BIGINT NULL CHECK (selling_price IS NULL OR selling_price >= 0),
  -- COA routing (nullable; falls back to coa-defaults.ts lookup)
  coa_account_inventory TEXT NULL REFERENCES chart_of_accounts(code),
  coa_account_cogs TEXT NULL REFERENCES chart_of_accounts(code),
  coa_account_wastage TEXT NULL REFERENCES chart_of_accounts(code),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_inventory_config_min_stock
  ON items_inventory_config(min_stock_alert) WHERE min_stock_alert > 0;

COMMENT ON TABLE items_inventory_config IS
  'Satellite 1:1 untuk inventory_items.category=inventory. Field consumable-specific dipisah dari base table supaya schema strict.';

-- ============================================================================
-- 4. Satellite table — items_fixed_asset_config (1:1 untuk category='fixed_asset')
-- ============================================================================

CREATE TABLE IF NOT EXISTS items_fixed_asset_config (
  item_id UUID PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
  asset_number TEXT UNIQUE NULL,        -- AST-CAM-001 etc. (NULL untuk legacy, akan diisi belakangan)
  serial_number TEXT NULL,
  purchase_price BIGINT NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  purchase_date DATE NULL,
  salvage_value BIGINT NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  useful_life_months INTEGER NULL CHECK (useful_life_months IS NULL OR useful_life_months > 0),
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line', 'none')),
  depreciation_start_date DATE NULL,
  condition equipment_condition NULL,
  current_location equipment_location NULL,
  current_event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL,
  current_crew_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  -- COA routing
  coa_account_asset TEXT NULL REFERENCES chart_of_accounts(code),
  coa_account_accum_depr TEXT NULL REFERENCES chart_of_accounts(code),
  coa_account_depr_expense TEXT NULL REFERENCES chart_of_accounts(code),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_fixed_asset_event
  ON items_fixed_asset_config(current_event_id) WHERE current_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_fixed_asset_crew
  ON items_fixed_asset_config(current_crew_id) WHERE current_crew_id IS NOT NULL;

COMMENT ON TABLE items_fixed_asset_config IS
  'Satellite 1:1 untuk inventory_items.category=fixed_asset. Asset register + depresiasi metadata.';

-- ============================================================================
-- 5. Wastage logs table
-- ============================================================================

CREATE TABLE IF NOT EXISTS wastage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id TEXT UNIQUE NOT NULL,        -- WST-20260525-12345
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  qty_base NUMERIC(14, 4) NOT NULL CHECK (qty_base > 0),
  reason wastage_reason NOT NULL,
  reason_detail TEXT NULL,
  cost_at_time BIGINT NOT NULL DEFAULT 0,
  event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL,
  supplier_id UUID NULL REFERENCES suppliers(id) ON DELETE SET NULL,
  evidence_url TEXT NULL,
  stock_movement_id UUID NULL REFERENCES stock_movements(id) ON DELETE SET NULL,
  reported_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wastage_item ON wastage_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_wastage_reason ON wastage_logs(reason);
CREATE INDEX IF NOT EXISTS idx_wastage_created ON wastage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_wastage_event ON wastage_logs(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wastage_supplier ON wastage_logs(supplier_id) WHERE supplier_id IS NOT NULL;

COMMENT ON TABLE wastage_logs IS
  'Granular wastage classification — testing waste, DOA, handling damage, opname shortage, dll. Link ke stock_movements untuk audit trail.';

-- RLS: owner-level read/write only
ALTER TABLE items_inventory_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_fixed_asset_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE wastage_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "items_inventory_config_owner_all" ON items_inventory_config
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "items_fixed_asset_config_owner_all" ON items_fixed_asset_config
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "wastage_logs_owner_all" ON wastage_logs
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin','owner') AND is_active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 6. Backfill — populate satellites from existing inventory_items
-- ============================================================================

-- 6a. Backfill items_inventory_config dari row dengan category='inventory'
--     (yang sebelumnya 'consumable' setelah rename enum)
INSERT INTO items_inventory_config (
  item_id, base_unit, unit_conversion, min_stock_alert,
  purchase_price_avg, selling_price, created_at, updated_at
)
SELECT
  id,
  unit,
  COALESCE(unit_conversion, '{}'::jsonb),
  COALESCE(min_stock_alert, 0),
  COALESCE(purchase_price_avg, 0),
  selling_price,
  created_at,
  updated_at
FROM inventory_items
WHERE category = 'inventory'
ON CONFLICT (item_id) DO NOTHING;

-- 6b. Backfill items_fixed_asset_config dari row dengan category='fixed_asset'
INSERT INTO items_fixed_asset_config (
  item_id, purchase_price, purchase_date, useful_life_months,
  condition, current_location, current_event_id, current_crew_id,
  depreciation_method, depreciation_start_date,
  created_at, updated_at
)
SELECT
  id,
  COALESCE(purchase_price, 0),
  purchase_date,
  useful_life_months,
  condition,
  current_location,
  current_event_id,
  current_crew_id,
  -- Default straight_line; sebenarnya legacy data belum punya method explicit
  CASE WHEN useful_life_months IS NOT NULL AND useful_life_months > 0
       THEN 'straight_line'
       ELSE 'none' END,
  purchase_date,  -- start depresiasi = tanggal beli (default)
  created_at,
  updated_at
FROM inventory_items
WHERE category = 'fixed_asset'
ON CONFLICT (item_id) DO NOTHING;

-- ============================================================================
-- 7. Verification queries (run post-apply)
-- ============================================================================
-- Counts must match:
-- SELECT category, COUNT(*) FROM inventory_items WHERE deleted_at IS NULL GROUP BY category;
-- SELECT COUNT(*) FROM items_inventory_config;
-- SELECT COUNT(*) FROM items_fixed_asset_config;
--
-- Orphan check (must be 0):
-- SELECT id FROM inventory_items WHERE category='inventory' AND deleted_at IS NULL
--   AND id NOT IN (SELECT item_id FROM items_inventory_config);
-- SELECT id FROM inventory_items WHERE category='fixed_asset' AND deleted_at IS NULL
--   AND id NOT IN (SELECT item_id FROM items_fixed_asset_config);
--
-- COA check:
-- SELECT code, name FROM chart_of_accounts WHERE code IN ('5-510','4-900');
--
-- Enum check:
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'item_category'::regtype ORDER BY enumsortorder;
--   → expect: inventory, fixed_asset
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'movement_source'::regtype ORDER BY enumsortorder;
--   → expect to include: wastage
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'wastage_reason'::regtype ORDER BY enumsortorder;
--   → expect: testing, defective_on_arrival, handling_damage, production_reject,
--             expired, customer_returned, opname_shortage, other
