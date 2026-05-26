-- ============================================================================
-- 20260601_sync_fixed_asset_cost — Extend Market List trigger to also sync
-- items_fixed_asset_config.purchase_price (parallel to inventory_items.
-- purchase_price_avg). Closes the data silo between Market List ↔ Aset Tetap.
--
-- Sebelumnya sync_primary_to_master_cost cuma update inventory_items.
-- purchase_price_avg untuk category='inventory'. Fixed asset purchase_price
-- harus diisi manual via form edit — gak otomatis dari Market List.
--
-- Sekarang: ketika supplier_price diset is_primary=true untuk item
-- fixed_asset, items_fixed_asset_config.purchase_price ikut update ke
-- pack_price (assumption: fixed_asset selalu pack_size=1, jadi pack_price
-- == cost per unit).
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

    -- Conversion math (existing logic): flat key lookup, else fall through
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
        -- Sync inventory weighted-avg cost
        UPDATE inventory_items
        SET purchase_price_avg = ROUND(v_effective)::BIGINT,
            updated_at = NOW()
        WHERE id = NEW.item_id;
      ELSIF v_item.category = 'fixed_asset' THEN
        -- Sync fixed_asset acquisition cost
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

-- Trigger sudah ter-attach dari migration sebelumnya — function update saja
-- otomatis bikin new behavior aktif untuk INSERT/UPDATE berikutnya.

COMMENT ON FUNCTION sync_primary_to_master_cost() IS
  'Auto-sync master cost dari supplier_prices.pack_price ke parent item. inventory → purchase_price_avg, fixed_asset → items_fixed_asset_config.purchase_price.';
