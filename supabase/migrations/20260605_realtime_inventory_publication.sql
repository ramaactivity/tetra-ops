-- Enable Supabase Realtime untuk tabel inventory-related supaya semua client
-- yang sedang melihat warehouse / item edit auto-refresh kalau data berubah
-- di tab lain / user lain. Tanpa publication ini, Realtime websocket nggak
-- akan emit changes.
--
-- REPLICA IDENTITY FULL diperlukan supaya UPDATE/DELETE events carry full
-- row (bukan cuma primary key) — penting untuk client-side filtering.

ALTER TABLE inventory_items REPLICA IDENTITY FULL;
ALTER TABLE items_inventory_config REPLICA IDENTITY FULL;
ALTER TABLE items_fixed_asset_config REPLICA IDENTITY FULL;
ALTER TABLE supplier_prices REPLICA IDENTITY FULL;
ALTER TABLE stock_movements REPLICA IDENTITY FULL;

-- Add ke publication supabase_realtime (auto-created by Supabase Realtime
-- extension). Wrapped in DO block karena ADD TABLE error kalau sudah ada.
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE inventory_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE items_inventory_config;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE items_fixed_asset_config;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE supplier_prices;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE stock_movements;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
