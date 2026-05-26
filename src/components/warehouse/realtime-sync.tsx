"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribe ke Supabase Realtime channel untuk tabel inventory-related.
 * Setiap INSERT/UPDATE/DELETE pada tabel ini akan trigger router.refresh()
 * supaya server component re-fetch data terbaru tanpa user perlu reload.
 *
 * Debounce 300ms supaya batch operations (mis. bulk seed atau trigger
 * cascade) cuma trigger 1 refresh, bukan satu refresh per row.
 *
 * Tables yang di-watch:
 *   - inventory_items (base — name, sku, unit, unit_conversion)
 *   - items_inventory_config (satellite — bulk config, avg cost, supplier)
 *   - items_fixed_asset_config (satellite — asset data)
 *   - supplier_prices (Market List entries, primary toggle)
 *   - stock_movements (in/out/adjustment)
 *
 * Drop component ini di mana saja yang butuh auto-sync — warehouse page,
 * item edit page, market list, dst.
 */
export function WarehouseRealtimeSync() {
	const router = useRouter();
	const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const supabase = createClient();

		const scheduleRefresh = () => {
			if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
			refreshTimeoutRef.current = setTimeout(() => {
				router.refresh();
			}, 300);
		};

		const channel = supabase
			.channel("warehouse-realtime-sync")
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "inventory_items" },
				scheduleRefresh,
			)
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "items_inventory_config" },
				scheduleRefresh,
			)
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "items_fixed_asset_config" },
				scheduleRefresh,
			)
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "supplier_prices" },
				scheduleRefresh,
			)
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "stock_movements" },
				scheduleRefresh,
			)
			.subscribe();

		return () => {
			if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
			supabase.removeChannel(channel);
		};
	}, [router]);

	return null;
}
