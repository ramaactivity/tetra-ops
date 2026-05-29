/**
 * verify-snapshot-stock.ts — READ-ONLY. Untuk tiap crew_rekap yang punya
 * hpp_snapshot, bandingkan hpp_snapshot_total vs Σ(stock_movements value)
 * rekap_consumption out. Harus ≈ sama (snapshot = nilai stok yang keluar).
 *
 * Usage: node --experimental-strip-types --env-file=.env.local --no-warnings \
 *          scripts/verify-snapshot-stock.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error("❌ Missing env");
	process.exit(1);
}
const sb = createClient(url, key, {
	auth: { autoRefreshToken: false, persistSession: false },
});
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

async function main() {
	const { data: rekaps } = await sb
		.from("crew_rekap")
		.select("id, event_id, hpp_snapshot, hpp_snapshot_total")
		.not("hpp_snapshot", "is", null);
	console.log(`Rekap dengan snapshot: ${rekaps?.length ?? 0}\n`);
	for (const r of rekaps ?? []) {
		const { data: moves } = await sb
			.from("stock_movements")
			.select("quantity, unit_cost, source_description, item:inventory_items(sku)")
			.eq("source", "rekap_consumption")
			.eq("source_id", r.event_id)
			.eq("direction", "out");
		const stockValue = (moves ?? []).reduce(
			(a, m) => a + (Number(m.quantity) || 0) * (Number(m.unit_cost) || 0),
			0,
		);
		const snap = Number(r.hpp_snapshot_total) || 0;
		const diff = Math.round(stockValue) - snap;
		console.log(
			`event ${r.event_id}\n  snapshot_total = ${rp(snap)}\n  stock_value    = ${rp(stockValue)}\n  diff           = ${diff >= 0 ? "+" : ""}${rp(diff)}  ${Math.abs(diff) <= 8 ? "✅ MATCH" : "⚠ CHECK"}`,
		);
		console.log(`  snapshot buckets: ${JSON.stringify(r.hpp_snapshot)}`);
		console.log("  movements:");
		for (const m of moves ?? []) {
			const item = Array.isArray(m.item) ? m.item[0] : m.item;
			console.log(
				`    ${((item as { sku?: string } | null)?.sku ?? "?").padEnd(14)} qty=${m.quantity}  @${rp(Number(m.unit_cost) || 0)}  = ${rp((Number(m.quantity) || 0) * (Number(m.unit_cost) || 0))}  [${m.source_description}]`,
			);
		}
		console.log("");
	}
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
