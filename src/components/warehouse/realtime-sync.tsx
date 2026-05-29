"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribe ke Supabase Realtime channel untuk tabel inventory-related.
 * Setiap INSERT/UPDATE/DELETE pada tabel ini akan trigger router.refresh()
 * supaya server component re-fetch data terbaru tanpa user perlu reload.
 *
 * BIAYA: router.refresh() me-render ulang SELURUH halaman warehouse di server
 * sebagai satu invocation Vercel — pada Fluid itu = Active CPU yang ditagih.
 * `stock_movements` high-churn (tiap stock in/out/adjustment, bulk seed,
 * cascade), jadi refresh-per-event tanpa throttle = storm yang menghabiskan
 * budget CPU. Dua guard dipakai untuk menjaga UX tetap "live" tapi hemat:
 *
 *   1. Throttle — maksimum 1 refresh per MIN_REFRESH_INTERVAL_MS, dengan
 *      trailing call supaya event terakhir di sebuah burst tidak hilang.
 *      Burst (bulk seed / stock-take / cascade) ter-coalesce jadi 1 refresh;
 *      aktivitas terus-menerus jadi 1 refresh / interval, bukan 1 / event.
 *   2. Visibility gate — tab yang hidden tidak refresh sama sekali (percuma
 *      bakar CPU untuk view yang tidak dilihat). Perubahan yang masuk saat
 *      hidden ditandai `pending` dan di-flush sekali saat tab kembali visible.
 *
 * Writer yang melakukan mutasi sudah dapat data fresh lewat revalidatePath di
 * server action-nya, jadi refresh realtime ini murni untuk tab/sesi LAIN.
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
const WATCHED_TABLES = [
	"inventory_items",
	"items_inventory_config",
	"items_fixed_asset_config",
	"supplier_prices",
	"stock_movements",
] as const;

const MIN_REFRESH_INTERVAL_MS = 2500;

export function WarehouseRealtimeSync() {
	const router = useRouter();
	const lastRefreshRef = useRef(0);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingRef = useRef(false);

	useEffect(() => {
		const supabase = createClient();
		let cleanup: (() => void) | null = null;
		let aborted = false;

		const isHidden = () => typeof document !== "undefined" && document.hidden;

		const doRefresh = () => {
			lastRefreshRef.current = Date.now();
			pendingRef.current = false;
			router.refresh();
		};

		// Throttle with trailing edge. Hidden tabs defer to a `pending` flag
		// that the visibility handler flushes — never a refresh while hidden.
		const scheduleRefresh = () => {
			if (isHidden()) {
				pendingRef.current = true;
				return;
			}
			const elapsed = Date.now() - lastRefreshRef.current;
			if (elapsed >= MIN_REFRESH_INTERVAL_MS) {
				if (timerRef.current) {
					clearTimeout(timerRef.current);
					timerRef.current = null;
				}
				doRefresh();
				return;
			}
			// Inside cooldown — queue a single trailing refresh for when it ends.
			if (!timerRef.current) {
				timerRef.current = setTimeout(() => {
					timerRef.current = null;
					if (isHidden()) {
						pendingRef.current = true;
						return;
					}
					doRefresh();
				}, MIN_REFRESH_INTERVAL_MS - elapsed);
			}
		};

		const onVisibility = () => {
			if (!isHidden() && pendingRef.current) scheduleRefresh();
		};
		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", onVisibility);
		}

		(async () => {
			// Wait for session — realtime needs JWT to pass RLS on the server.
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (aborted) return;
			if (session?.access_token) {
				supabase.realtime.setAuth(session.access_token);
			}

			let channel = supabase.channel("warehouse-realtime-sync");
			for (const table of WATCHED_TABLES) {
				channel = channel.on(
					"postgres_changes",
					{ event: "*", schema: "public", table },
					scheduleRefresh,
				);
			}
			channel.subscribe((status, err) => {
				if (status === "SUBSCRIBED") {
					console.debug("[realtime] warehouse channel subscribed");
				} else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
					console.warn("[realtime] channel issue:", status, err);
				}
			});

			// Refresh JWT in channel kalau session di-rotate (TOKEN_REFRESHED).
			const { data: authSub } = supabase.auth.onAuthStateChange(
				(_event, sess) => {
					if (sess?.access_token) {
						supabase.realtime.setAuth(sess.access_token);
					}
				},
			);

			cleanup = () => {
				authSub.subscription.unsubscribe();
				supabase.removeChannel(channel);
			};
		})();

		return () => {
			aborted = true;
			if (timerRef.current) clearTimeout(timerRef.current);
			if (typeof document !== "undefined") {
				document.removeEventListener("visibilitychange", onVisibility);
			}
			cleanup?.();
		};
	}, [router]);

	return null;
}
