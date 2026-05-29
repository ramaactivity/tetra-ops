/**
 * verify-settlement.ts — READ-ONLY. Verifikasi settlement terbaru:
 *   • event_settlements.hpp_total vs crew_rekap.hpp_snapshot_total (harus ==)
 *   • journal Σdebit == Σcredit (harus exact balance)
 *   • tidak ada double-deduct (out movements source=settlement = 0; konsumsi
 *     hanya source=rekap_consumption)
 *
 * Usage: node --experimental-strip-types --env-file=.env.local --no-warnings \
 *          scripts/verify-settlement.ts
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
	const { data: s } = await sb
		.from("event_settlements")
		.select(
			"id, event_id, hpp_total, net_profit, revenue_net, journal_entry_id, closed_at",
		)
		.eq("is_reopened", false)
		.order("closed_at", { ascending: false })
		.limit(1)
		.maybeSingle();
	if (!s) {
		console.log("Belum ada settlement.");
		return;
	}
	console.log(`Settlement terbaru — event ${s.event_id}`);
	console.log(`  revenue_net = ${rp(Number(s.revenue_net) || 0)}`);
	console.log(`  hpp_total   = ${rp(Number(s.hpp_total) || 0)}`);
	console.log(`  net_profit  = ${rp(Number(s.net_profit) || 0)}`);

	// 1) hpp_total vs snapshot
	const { data: rk } = await sb
		.from("crew_rekap")
		.select("hpp_snapshot_total")
		.eq("event_id", s.event_id)
		.maybeSingle();
	const snap = Number(rk?.hpp_snapshot_total) || 0;
	const hppMatch = Math.abs(snap - (Number(s.hpp_total) || 0)) <= 1;
	console.log(
		`\n[1] hpp_total vs snapshot: ${rp(Number(s.hpp_total) || 0)} vs ${rp(snap)} → ${hppMatch ? "✅ MATCH" : "⚠ MISMATCH"}`,
	);

	// 2) journal balance
	if (s.journal_entry_id) {
		const { data: lines } = await sb
			.from("journal_lines")
			.select("debit_amount, credit_amount")
			.eq("entry_id", s.journal_entry_id);
		const dr = (lines ?? []).reduce((a, l) => a + (Number(l.debit_amount) || 0), 0);
		const cr = (lines ?? []).reduce((a, l) => a + (Number(l.credit_amount) || 0), 0);
		console.log(
			`[2] journal Σdebit vs Σcredit: ${rp(dr)} vs ${rp(cr)} → ${dr === cr ? "✅ BALANCED" : "❌ IMBALANCE " + rp(dr - cr)}`,
		);
	} else {
		console.log("[2] journal: ⚠ tidak ada journal_entry_id");
	}

	// 3) double-deduct check
	const { data: outMoves } = await sb
		.from("stock_movements")
		.select("source")
		.eq("source_id", s.event_id)
		.eq("direction", "out");
	const bySrc: Record<string, number> = {};
	for (const m of outMoves ?? [])
		bySrc[m.source] = (bySrc[m.source] ?? 0) + 1;
	const settlementOut = bySrc["settlement"] ?? 0;
	console.log(
		`[3] out-movements by source: ${JSON.stringify(bySrc)} → ${settlementOut === 0 ? "✅ no settlement-source deduct (single engine)" : "❌ ada " + settlementOut + " deduct dari settlement (double!)"}`,
	);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
