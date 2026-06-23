-- Phase 1b — Resolve purchase_price_avg source-of-truth conflict
-- =================================================================
-- THE BUG: two writers fought over inventory_items.purchase_price_avg —
--   (A) sync_primary_to_master_cost (supplier-price trigger) HARD-OVERWRITES it
--       with the primary supplier's effective unit price, and
--   (B) recompute_weighted_avg_cost (purchases) sets it to the real weighted
--       average of actual stock-in.
-- Last-writer-wins: setting a primary price AFTER purchases clobbered the real
-- weighted average back to a quote, corrupting HPP/valuation.
--
-- THE FIX (numerically zero-change today):
--   1. Add expected_supplier_cost — tracks the primary supplier's quoted unit
--      cost, written ONLY by the trigger. A clean home for "what we'd pay".
--   2. The trigger now SEEDS purchase_price_avg only while an item has NO real
--      purchase history (so newly-created items still get a cost estimate), and
--      NEVER touches it once real purchases exist — the weighted-avg RPC owns it
--      from then on. This kills the clobber without resetting any current value
--      (today every primary-priced item is unpurchased, so avg == expected).
--
-- Readers keep using purchase_price_avg unchanged. expected_supplier_cost is
-- available for "harga beli" suggestions (forecast) where a quote is wanted.

-- 1. New column (additive, nullable).
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS expected_supplier_cost BIGINT;

COMMENT ON COLUMN inventory_items.expected_supplier_cost IS
  'Primary supplier quoted unit cost (pack_price / base qty). Written only by sync_primary_to_master_cost. Distinct from purchase_price_avg (real weighted-average of actual stock-in).';

-- 2. Backfill expected_supplier_cost from current primary prices (same math as
--    the trigger: v1 flat conversion key, else pack_size is already base qty).
UPDATE inventory_items i
SET expected_supplier_cost = ROUND(
  sp.pack_price::numeric / NULLIF(
    CASE
      WHEN i.unit_conversion IS NOT NULL AND i.unit_conversion ? sp.pack_unit
        THEN sp.pack_size * ((i.unit_conversion ->> sp.pack_unit)::numeric)
      ELSE sp.pack_size
    END, 0)
)::bigint
FROM supplier_prices sp
WHERE sp.item_id = i.id
  AND sp.is_primary = true
  AND i.category = 'inventory';

-- 3. Rewrite the trigger: track expected_supplier_cost always; SEED avg only
--    when no real purchase history exists. fixed_asset branch unchanged.
CREATE OR REPLACE FUNCTION sync_primary_to_master_cost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_base_qty NUMERIC;
  v_effective NUMERIC;
  v_item RECORD;
  v_has_purchases BOOLEAN;
BEGIN
  IF NEW.is_primary = true THEN
    SELECT unit, unit_conversion, category INTO v_item
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

      IF v_item.category = 'inventory' THEN
        -- Always track the quoted cost in its own column.
        UPDATE inventory_items
        SET expected_supplier_cost = ROUND(v_effective)::BIGINT,
            updated_at = NOW()
        WHERE id = NEW.item_id;

        -- Seed the weighted-average ONLY if there is no real purchase history.
        -- Once any purchase/PR-receive movement exists, the weighted-avg RPC
        -- owns purchase_price_avg and the trigger must never clobber it.
        SELECT EXISTS (
          SELECT 1 FROM stock_movements
          WHERE item_id = NEW.item_id
            AND direction = 'in'
            AND source IN ('purchase', 'purchase_request')
        ) INTO v_has_purchases;

        IF NOT v_has_purchases THEN
          UPDATE inventory_items
          SET purchase_price_avg = ROUND(v_effective)::BIGINT,
              updated_at = NOW()
          WHERE id = NEW.item_id;

          UPDATE items_inventory_config
          SET purchase_price_avg = ROUND(v_effective)::BIGINT,
              updated_at = NOW()
          WHERE item_id = NEW.item_id;
        END IF;
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

COMMENT ON FUNCTION sync_primary_to_master_cost() IS
  'Phase 1b: writes expected_supplier_cost from supplier_prices primary; SEEDS purchase_price_avg (base + config) only while the item has no real purchase movements, never clobbering a real weighted-average. fixed_asset → items_fixed_asset_config.purchase_price.';
