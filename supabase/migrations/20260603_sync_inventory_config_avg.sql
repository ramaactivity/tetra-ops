-- ============================================================================
-- 20260603_sync_inventory_config_avg — Extend trigger to ALSO sync
-- items_inventory_config.purchase_price_avg (eliminate stale satellite).
--
-- Bug yang fixed: sync_primary_to_master_cost cuma update inventory_items.
-- purchase_price_avg (base table). Tapi banyak reader baca dari satellite
-- items_inventory_config.purchase_price_avg yang NEVER updated → stale.
-- Akibat: Item edit page tampil Rp 725.000 padahal Market List dan
-- warehouse table sudah Rp 1.425.000 (correctly synced from supplier_prices
-- primary update tadi).
--
-- Solusi: trigger update BOTH inventory_items + items_inventory_config.
-- Plus one-time backfill seluruh satellite dari base.
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

    -- Conversion math (legacy v1 flat key lookup, else fall through).
    -- For v2 shape (units.{key}.multiplier), top-level key check fails → ELSE
    -- branch. pack_size dianggap sudah dalam base unit qty (semantic Model A:
    -- "isi per pack = berapa base unit dalam 1 pack"). Form preview HARUS
    -- match semantic ini (no extra toBase multiplication).
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
        -- Sync BOTH base table dan satellite (consistency between readers)
        UPDATE inventory_items
        SET purchase_price_avg = ROUND(v_effective)::BIGINT,
            updated_at = NOW()
        WHERE id = NEW.item_id;

        UPDATE items_inventory_config
        SET purchase_price_avg = ROUND(v_effective)::BIGINT,
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

-- Trigger sudah ter-attach dari migration 20260521. Function update saja
-- otomatis bikin new behavior aktif untuk semua INSERT/UPDATE berikutnya.

-- ============================================================================
-- One-time backfill: sync semua items_inventory_config dari inventory_items
-- ============================================================================
UPDATE items_inventory_config c
SET purchase_price_avg = i.purchase_price_avg,
    updated_at = NOW()
FROM inventory_items i
WHERE c.item_id = i.id
  AND c.purchase_price_avg IS DISTINCT FROM i.purchase_price_avg;

COMMENT ON FUNCTION sync_primary_to_master_cost() IS
  'Auto-sync master cost dari supplier_prices primary ke parent item. inventory → BOTH inventory_items.purchase_price_avg DAN items_inventory_config.purchase_price_avg (eliminate stale satellite); fixed_asset → items_fixed_asset_config.purchase_price.';
