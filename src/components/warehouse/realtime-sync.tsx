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
 * Critical: SSR auth cookies tidak otomatis ke websocket Realtime. Harus
 * explicit `realtime.setAuth(session.access_token)` SEBELUM subscribe,
 * supaya RLS check di server-side pass. Tanpa ini, events di-filter karena
 * channel auth context jatuh ke `anon` yang nggak punya SELECT permission.
 *
 * Tables yang di-watch:
 *   - inventory_items (base)
 *   - items_inventory_config (satellite — bulk config, avg cost, supplier)
 *   - items_fixed_asset_config (satellite — asset data)
 *   - supplier_prices (Market List entries, primary toggle)
 *   - stock_movements (in/out/adjustment)
 */
export function WarehouseRealtimeSync() {
	const router = useRouter();
	const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const supabase = createClient();
		let cleanup: (() => void) | null = null;
		let aborted = false;

		const scheduleRefresh = () => {
			if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
			refreshTimeoutRef.current = setTimeout(() => {
				router.refresh();
			}, 300);
		};

		(async () => {
			// Wait for session — realtime needs JWT to pass RLS on the server.
			const { data: { session } } = await supabase.auth.getSession();
			if (aborted) return;
			if (session?.access_token) {
				supabase.realtime.setAuth(session.access_token);
			}

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
				.subscribe((status, err) => {
					if (status === "SUBSCRIBED") {
						console.debug("[realtime] warehouse channel subscribed");
					} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
						console.warn("[realtime] channel issue:", status, err);
					}
				});

			// Refresh JWT in channel kalau session di-rotate (TOKEN_REFRESHED).
			const { data: authSub } = supabase.auth.onAuthStateChange((_event, sess) => {
				if (sess?.access_token) {
					supabase.realtime.setAuth(sess.access_token);
				}
			});

			cleanup = () => {
				authSub.subscription.unsubscribe();
				supabase.removeChannel(channel);
			};
		})();

		return () => {
			aborted = true;
			if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
			cleanup?.();
		};
	}, [router]);

	return null;
}
