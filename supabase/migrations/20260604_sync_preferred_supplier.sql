-- ============================================================================
-- 20260604_sync_preferred_supplier — Auto-sync Market List primary ↔
-- items_inventory_config.preferred_supplier_id.
--
-- Konsep Tetra: 99% of the time, primary supplier (yang drive Avg Cost) =
-- preferred vendor (default pick saat Restock). Konfigurasi keduanya
-- terpisah cuma confusing buat Adit.
--
-- One-way sync (Market List sebagai source of truth):
-- - User set is_primary=true di supplier_prices → trigger auto-update
--   items_inventory_config.preferred_supplier_id ke supplier itu juga
-- - User edit preferred_supplier_id manual di Item form → bisa override
--   (sampai primary supplier_prices berikutnya bikin re-sync)
--
-- Trigger ada di sync_primary_to_master_cost (extend existing). Plus
-- one-time backfill untuk semua data existing.
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_primary_to_master_cost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_base_qty NUMERIC;
  v_effective NUMERIC;
  v_item RECORD;
BEGIN
  IF NEW.is_primary = true THEN
    SELECT unit, unit_conversion, category INTO v_item
    FROM inventory_items WHERE id = NEW.item_id;

    -- Conversion math (v1 flat key or v2 fallback)
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

      IF v_item.category = 'inventory' THEN
        -- Sync BOTH base + satellite + preferred_supplier_id
        UPDATE inventory_items
        SET purchase_price_avg = ROUND(v_effective)::BIGINT,
            updated_at = NOW()
        WHERE id = NEW.item_id;

        UPDATE items_inventory_config
        SET purchase_price_avg = ROUND(v_effective)::BIGINT,
            preferred_supplier_id = NEW.supplier_id,
            updated_at = NOW()
        WHERE item_id = NEW.item_id;
      ELSIF v_item.category = 'fixed_asset' THEN
        UPDATE items_fixed_asset_config
        SET purchase_price = ROUND(v_effective)::BIGINT,
            updated_at = NOW()
        WHERE item_id = NEW.item_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- One-time backfill: sync preferred_supplier_id dari primary supplier_prices
-- untuk semua inventory items existing.
-- ============================================================================
UPDATE items_inventory_config c
SET preferred_supplier_id = sp.supplier_id,
    updated_at = NOW()
FROM supplier_prices sp
WHERE c.item_id = sp.item_id
  AND sp.is_primary = true
  AND (c.preferred_supplier_id IS NULL
       OR c.preferred_supplier_id IS DISTINCT FROM sp.supplier_id);

COMMENT ON FUNCTION sync_primary_to_master_cost() IS
  'Auto-sync dari supplier_prices primary ke parent item: inventory_items.purchase_price_avg + items_inventory_config.{purchase_price_avg, preferred_supplier_id}; OR items_fixed_asset_config.purchase_price untuk fixed_asset.';
