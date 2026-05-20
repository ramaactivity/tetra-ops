-- 20260521_inventory_v2_suppliers_marketlist.sql
-- ============================================================================
-- Inventory v2 — STEP 6: Supplier master + Market List + Purchase Requests
-- ============================================================================
--
-- New surface area (adopted from Mahakan POS pattern, adapted for photobooth):
--
-- A. SUPPLIERS — master vendor table. Owner buys FD-BOX from Toko A, KEY-FRAME
--    from Toko B, MEDIA-BASIC from percetakan C. Default payment term (cash /
--    TOP N) lives here so it auto-fills on Pembelian.
--
-- B. SUPPLIER_PRICES (Market List) — junction (supplier × item) recording the
--    pack price + pack size. Owner can list 2-3 suppliers per item and tag
--    one ⭐ Primary; the primary's effective cost auto-syncs to the item's
--    purchase_price_avg (drives HPP, Nilai, COGS).
--
-- C. stock_movements.supplier_id — nullable FK so each purchase movement can
--    be attributed to a vendor. Drives "Spent at Toko A in March" reports.
--
-- D. PURCHASE_REQUESTS + PURCHASE_REQUEST_ITEMS — crew creates "tolong belanja
--    sleeve sebelum event", owner receives partial / full. Receive creates
--    stock_movement(s) tagged source=purchase_request.
--
-- Triggers:
--   - Enforce single Primary supplier per item.
--   - Auto-sync Primary supplier's effective cost to inventory_items.purchase_price_avg.
--
-- Idempotent.

-- ============================================================================
-- 1. SUPPLIERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT,
  contact TEXT,
  default_payment_term TEXT NOT NULL DEFAULT 'cash'
    CHECK (default_payment_term IN ('cash', 'top_7', 'top_14', 'top_30', 'top_60', 'top_custom')),
  default_top_days INTEGER NOT NULL DEFAULT 0 CHECK (default_top_days >= 0),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_active
  ON suppliers(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_name
  ON suppliers(name) WHERE deleted_at IS NULL;

COMMENT ON TABLE suppliers IS
  'Vendor master. Default payment term (cash/TOP N) used by Pembelian dialog.';

-- ============================================================================
-- 2. SUPPLIER_PRICES (Market List)
-- ============================================================================

CREATE TABLE IF NOT EXISTS supplier_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  pack_price BIGINT NOT NULL CHECK (pack_price >= 0),
  pack_size NUMERIC(12, 4) NOT NULL CHECK (pack_size > 0),
  pack_unit TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_prices_item
  ON supplier_prices(item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_supplier
  ON supplier_prices(supplier_id);
-- Unique partial: only one is_primary=true per item
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_prices_primary
  ON supplier_prices(item_id) WHERE is_primary = true;

COMMENT ON TABLE supplier_prices IS
  'Market List: supplier × item price catalog. is_primary=true designates the canonical supplier whose effective cost (pack_price / pack_size, scaled via unit_conversion if pack_unit differs from item.unit) auto-syncs to inventory_items.purchase_price_avg.';

-- ============================================================================
-- 3. stock_movements.supplier_id (purchase attribution)
-- ============================================================================

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_supplier
  ON stock_movements(supplier_id) WHERE supplier_id IS NOT NULL;

-- ============================================================================
-- 4. PURCHASE REQUESTS (crew → owner shopping list)
-- ============================================================================

CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requested_by UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partial', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pr_status
  ON purchase_requests(status) WHERE status IN ('open', 'partial');
CREATE INDEX IF NOT EXISTS idx_pr_created_at
  ON purchase_requests(created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_request_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pr_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  qty_requested NUMERIC(12, 4) NOT NULL CHECK (qty_requested > 0),
  qty_received NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  unit TEXT NOT NULL,
  notes TEXT,
  UNIQUE (pr_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_pri_pr ON purchase_request_items(pr_id);

COMMENT ON TABLE purchase_requests IS
  'Crew-initiated shopping requests. Aging > 3 days = stale flag in UI.';

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

-- Enforce single Primary per item (when toggling on, turn off other primaries
-- for the same item).
CREATE OR REPLACE FUNCTION enforce_single_primary_supplier()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE supplier_prices
    SET is_primary = false, updated_at = NOW()
    WHERE item_id = NEW.item_id
      AND id != NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_primary ON supplier_prices;
CREATE TRIGGER trg_single_primary
  BEFORE INSERT OR UPDATE OF is_primary ON supplier_prices
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_primary_supplier();

-- Auto-sync Primary's effective cost → inventory_items.purchase_price_avg.
-- Conversion: if pack_unit matches a key in item.unit_conversion JSONB, scale
-- pack_size into base units using that multiplier. Otherwise assume pack_unit
-- equals item.unit (multiplier 1).
CREATE OR REPLACE FUNCTION sync_primary_to_master_cost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_base_qty NUMERIC;
  v_effective NUMERIC;
  v_item RECORD;
BEGIN
  IF NEW.is_primary = true THEN
    SELECT unit, unit_conversion INTO v_item
    FROM inventory_items WHERE id = NEW.item_id;

    IF v_item.unit_conversion IS NOT NULL
       AND v_item.unit_conversion ? NEW.pack_unit
    THEN
      v_base_qty := NEW.pack_size *
        ((v_item.unit_conversion ->> NEW.pack_unit)::NUMERIC);
    ELSE
      v_base_qty := NEW.pack_size;
    END IF;

    IF v_base_qty > 0 THEN
      v_effective := NEW.pack_price::NUMERIC / v_base_qty;
      UPDATE inventory_items
      SET purchase_price_avg = ROUND(v_effective)::BIGINT,
          updated_at = NOW()
      WHERE id = NEW.item_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_cost ON supplier_prices;
CREATE TRIGGER trg_sync_primary_cost
  AFTER INSERT OR UPDATE ON supplier_prices
  FOR EACH ROW
  EXECUTE FUNCTION sync_primary_to_master_cost();

-- PR status auto-roll: when all items fully received → completed; partial → partial.
CREATE OR REPLACE FUNCTION recompute_pr_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_pr_id UUID;
  v_total INTEGER;
  v_full INTEGER;
  v_partial INTEGER;
  v_current_status TEXT;
BEGIN
  v_pr_id := COALESCE(NEW.pr_id, OLD.pr_id);

  SELECT status INTO v_current_status
  FROM purchase_requests WHERE id = v_pr_id;

  -- Don't auto-roll cancelled requests
  IF v_current_status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE qty_received >= qty_requested),
    COUNT(*) FILTER (WHERE qty_received > 0 AND qty_received < qty_requested)
  INTO v_total, v_full, v_partial
  FROM purchase_request_items
  WHERE pr_id = v_pr_id;

  IF v_total = 0 OR v_full < v_total THEN
    IF v_full > 0 OR v_partial > 0 THEN
      UPDATE purchase_requests
      SET status = 'partial', updated_at = NOW()
      WHERE id = v_pr_id AND status != 'partial';
    ELSE
      UPDATE purchase_requests
      SET status = 'open', updated_at = NOW()
      WHERE id = v_pr_id AND status != 'open';
    END IF;
  ELSE
    UPDATE purchase_requests
    SET status = 'completed',
        completed_at = COALESCE(completed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_pr_id AND status != 'completed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pr_status ON purchase_request_items;
CREATE TRIGGER trg_pr_status
  AFTER INSERT OR UPDATE OF qty_received OR DELETE ON purchase_request_items
  FOR EACH ROW
  EXECUTE FUNCTION recompute_pr_status();

-- ============================================================================
-- 6. RLS
-- ============================================================================

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS suppliers_read_all ON suppliers;
CREATE POLICY suppliers_read_all ON suppliers
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS suppliers_owner_mutate ON suppliers;
CREATE POLICY suppliers_owner_mutate ON suppliers
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin')
  ));

ALTER TABLE supplier_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplier_prices_read_all ON supplier_prices;
CREATE POLICY supplier_prices_read_all ON supplier_prices
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS supplier_prices_owner_mutate ON supplier_prices;
CREATE POLICY supplier_prices_owner_mutate ON supplier_prices
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin')
  ));

ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pr_read_all ON purchase_requests;
CREATE POLICY pr_read_all ON purchase_requests
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pr_crew_create ON purchase_requests;
CREATE POLICY pr_crew_create ON purchase_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid()
        AND role IN ('owner', 'super_admin', 'crew')
    )
    AND requested_by = auth.uid()
  );
DROP POLICY IF EXISTS pr_owner_mutate ON purchase_requests;
CREATE POLICY pr_owner_mutate ON purchase_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin')
  ));

ALTER TABLE purchase_request_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pri_read_all ON purchase_request_items;
CREATE POLICY pri_read_all ON purchase_request_items
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pri_owner_mutate ON purchase_request_items;
CREATE POLICY pri_owner_mutate ON purchase_request_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin', 'crew')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid()
      AND role IN ('owner', 'super_admin', 'crew')
  ));
