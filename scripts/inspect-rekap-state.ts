/**
 * inspect-rekap-state.ts — READ-ONLY. Tidak menulis apa pun.
 * Snapshot kondisi event + crew_rekap untuk menentukan jalur verifikasi Stage 2.
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/inspect-rekap-state.ts
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

async function main() {
	const { data: events } = await sb
		.from("events")
		.select("status")
		.is("deleted_at", null);
	const byStatus: Record<string, number> = {};
	for (const e of events ?? [])
		byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
	console.log("EVENTS by status:");
	for (const [s, n] of Object.entries(byStatus)) console.log(`  ${s}: ${n}`);

	const { data: rekaps } = await sb
		.from("crew_rekap")
		.select(
			"event_id, status, is_approved, stock_committed_at, hpp_snapshot_total",
		);
	console.log(`\nCREW_REKAP (${rekaps?.length ?? 0} total):`);
	const rk: Record<string, number> = {};
	for (const r of rekaps ?? []) {
		const k = `${r.status} | approved=${r.is_approved} | committed=${r.stock_committed_at ? "Y" : "N"} | snapshot=${r.hpp_snapshot_total != null ? "Y" : "N"}`;
		rk[k] = (rk[k] ?? 0) + 1;
	}
	for (const [k, n] of Object.entries(rk)) console.log(`  [${n}] ${k}`);

	console.log("\nDetail per rekap (+ HPP lama via calculate_recap_hpp, read-only):");
	for (const r of rekaps ?? []) {
		// Need rekap id for the RPC — re-fetch minimal
		const { data: rk } = await sb
			.from("crew_rekap")
			.select("id")
			.eq("event_id", r.event_id)
			.maybeSingle();
		let oldHpp = "n/a";
		if (rk?.id) {
			const { data, error } = await sb.rpc("calculate_recap_hpp", {
				p_recap_id: rk.id,
			});
			if (!error && data) {
				oldHpp = `Rp ${Number((data as { total?: number }).total ?? 0).toLocaleString("id-ID")}`;
			} else if (error) {
				oldHpp = `err: ${error.message}`;
			}
		}
		console.log(
			`  ${r.event_id} → status=${r.status} approved=${r.is_approved} committed=${r.stock_committed_at ? "Y" : "N"} snapshot=${r.hpp_snapshot_total ?? "—"} | old_hpp=${oldHpp}`,
		);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
