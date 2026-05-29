/**
 * validate-hpp-snapshot.ts — READ-ONLY. Tidak menulis apa pun.
 *
 * Buktikan tesis "HPP = nilai stok yang benar-benar keluar" di data historis:
 * untuk tiap event yang sudah settled, bandingkan
 *   (a) event_settlements.hpp_total  (angka lama, dari calculate_recap_hpp)
 *   (b) Σ(stock_movements.quantity × unit_cost) source=rekap_consumption out
 *       (angka kanonik baru = nilai stok riil yang keluar)
 * Selisihnya = persis bug yang Phase 2 perbaiki (assembly/bundle under-cost,
 * SKU/ratio drift). Output buat validasi sebelum switch.
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/validate-hpp-snapshot.ts [limit]
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error("❌ Missing env");
	process.exit(1);
}
const limit = Number(process.argv[2] ?? 20);
const sb = createClient(url, key, {
	auth: { autoRefreshToken: false, persistSession: false },
});

function rp(n: number) {
	return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

async function main() {
	const { data: settlements, error } = await sb
		.from("event_settlements")
		.select("event_id, hpp_total, is_reopened, closed_at")
		.eq("is_reopened", false)
		.order("closed_at", { ascending: false })
		.limit(limit);
	if (error) {
		console.error("❌", error.message);
		process.exit(1);
	}
	console.log(
		`Comparing ${settlements?.length ?? 0} settled event(s): stored hpp_total vs canonical stock-value\n`,
	);
	console.log(
		"event_id".padEnd(26),
		"stored_hpp".padStart(14),
		"stock_value".padStart(14),
		"diff".padStart(12),
	);
	console.log("-".repeat(70));

	let nMatch = 0;
	let nDiff = 0;
	let totalStored = 0;
	let totalStock = 0;
	for (const s of settlements ?? []) {
		const { data: moves } = await sb
			.from("stock_movements")
			.select("quantity, unit_cost")
			.eq("source", "rekap_consumption")
			.eq("source_id", s.event_id)
			.eq("direction", "out");
		const stockValue = (moves ?? []).reduce(
			(acc, m) => acc + (Number(m.quantity) || 0) * (Number(m.unit_cost) || 0),
			0,
		);
		const stored = Number(s.hpp_total) || 0;
		const diff = Math.round(stockValue) - stored;
		totalStored += stored;
		totalStock += Math.round(stockValue);
		if (Math.abs(diff) <= 8) nMatch++;
		else nDiff++;
		console.log(
			String(s.event_id).padEnd(26),
			rp(stored).padStart(14),
			rp(stockValue).padStart(14),
			(diff >= 0 ? "+" : "") + rp(diff).padStart(11),
		);
	}
	console.log("-".repeat(70));
	console.log(
		`match(≈): ${nMatch}  diff: ${nDiff}  |  Σstored ${rp(totalStored)}  Σstock ${rp(totalStock)}  Δ ${rp(totalStock - totalStored)}`,
	);
	console.log(
		"\nCatatan: diff > 0 (stock_value > stored_hpp) = HPP lama UNDER-cost " +
			"(assembly/bundle tak ke-hitung) → angka kanonik lebih akurat. " +
			"diff besar perlu di-review per event sebelum switch Stage 2.",
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
