/**
 * system-health-check.ts — READ-ONLY. Sweep invariant end-to-end (terutama
 * rantai keuangan: event → rekap → settle → journal/finance). Tidak menulis.
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/system-health-check.ts
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

let pass = 0;
let fail = 0;
const issues: string[] = [];
function ok(msg: string) {
	console.log(`  ✅ ${msg}`);
	pass++;
}
function bad(msg: string) {
	console.log(`  ❌ ${msg}`);
	issues.push(msg);
	fail++;
}

async function main() {
	// ── 1. Settlement ↔ journal balance + hpp == snapshot ──────────────────
	console.log("\n[1] Settlement integrity (journal balance, hpp==snapshot)");
	const { data: setts } = await sb
		.from("event_settlements")
		.select(
			"id, event_id, hpp_total, net_profit, revenue_net, journal_entry_id, is_reopened",
		);
	const live = (setts ?? []).filter((s) => !s.is_reopened);
	console.log(
		`  ${setts?.length ?? 0} settlement total · ${live.length} aktif (non-reopened)`,
	);
	for (const s of live) {
		// journal balance
		if (!s.journal_entry_id) {
			bad(`Settlement ${s.event_id}: TIDAK punya journal_entry_id`);
		} else {
			const { data: lines } = await sb
				.from("journal_lines")
				.select("debit_amount, credit_amount")
				.eq("entry_id", s.journal_entry_id);
			const dr = (lines ?? []).reduce(
				(a, l) => a + (Number(l.debit_amount) || 0),
				0,
			);
			const cr = (lines ?? []).reduce(
				(a, l) => a + (Number(l.credit_amount) || 0),
				0,
			);
			if (dr !== cr)
				bad(`Settlement ${s.event_id}: jurnal TIDAK balance (Δ ${rp(dr - cr)})`);
		}
		// hpp vs snapshot
		const { data: rk } = await sb
			.from("crew_rekap")
			.select("hpp_snapshot_total")
			.eq("event_id", s.event_id)
			.maybeSingle();
		if (rk?.hpp_snapshot_total != null) {
			const diff = Number(rk.hpp_snapshot_total) - (Number(s.hpp_total) || 0);
			if (Math.abs(diff) > 1)
				bad(
					`Settlement ${s.event_id}: hpp_total (${rp(Number(s.hpp_total) || 0)}) ≠ snapshot (${rp(Number(rk.hpp_snapshot_total))})`,
				);
		}
	}
	if (fail === 0) ok("Semua settlement aktif: jurnal balance & hpp==snapshot");

	// ── 2. Stuck rekap (approved tapi belum commit) ─────────────────────────
	console.log("\n[2] Rekap nyangkut (approved tapi stok belum commit)");
	const before2 = fail;
	const { data: stuck } = await sb
		.from("crew_rekap")
		.select("event_id, is_approved, stock_committed_at, status")
		.eq("is_approved", true)
		.is("stock_committed_at", null);
	for (const r of stuck ?? [])
		bad(`Rekap ${r.event_id}: approved tapi stock_committed_at NULL (status ${r.status})`);
	if (fail === before2)
		ok("Tidak ada rekap approved-tanpa-commit (invariant single-engine aman)");

	// ── 3. Committed tanpa snapshot (akan kena fallback lama saat settle) ───
	console.log("\n[3] Rekap committed tanpa snapshot (risiko fallback drifted)");
	const before3 = fail;
	const { data: noSnap } = await sb
		.from("crew_rekap")
		.select("event_id, status")
		.not("stock_committed_at", "is", null)
		.is("hpp_snapshot", null)
		.neq("status", "settled");
	for (const r of noSnap ?? [])
		bad(`Rekap ${r.event_id}: committed tapi hpp_snapshot NULL (status ${r.status})`);
	if (fail === before3) ok("Semua rekap committed punya snapshot (HPP kanonik)");

	// ── 4. Orphan owner_earnings / sinking (settlement sudah hilang) ────────
	console.log("\n[4] Orphan finansial (ref ke settlement yg tidak ada)");
	const before4 = fail;
	const settIds = new Set((setts ?? []).map((s) => s.id));
	const { data: oe } = await sb
		.from("owner_earnings")
		.select("source_settlement_id")
		.not("source_settlement_id", "is", null);
	const orphanOe = (oe ?? []).filter(
		(r) => r.source_settlement_id && !settIds.has(r.source_settlement_id),
	).length;
	const { data: sf } = await sb
		.from("sinking_fund_movements")
		.select("source_settlement_id")
		.not("source_settlement_id", "is", null);
	const orphanSf = (sf ?? []).filter(
		(r) => r.source_settlement_id && !settIds.has(r.source_settlement_id),
	).length;
	if (orphanOe > 0)
		bad(`${orphanOe} owner_earnings nyangkut ke settlement yg sudah dihapus`);
	if (orphanSf > 0)
		bad(`${orphanSf} sinking_fund_movements nyangkut ke settlement yg sudah dihapus`);
	if (fail === before4) ok("Tidak ada orphan owner_earnings / sinking");

	// ── 5. Owner pool & sinking balance net (sanity) ────────────────────────
	console.log("\n[5] Ringkasan finansial (sanity)");
	const netProfit = live.reduce((a, s) => a + (Number(s.net_profit) || 0), 0);
	console.log(`  Σ net_profit (settlement aktif) = ${rp(netProfit)}`);
	const { data: oeAll } = await sb.from("owner_earnings").select("amount");
	const oeNet = (oeAll ?? []).reduce((a, r) => a + (Number(r.amount) || 0), 0);
	console.log(`  Σ owner_earnings (semua, net) = ${rp(oeNet)}`);

	// ── 6. Event/rekap status overview ──────────────────────────────────────
	console.log("\n[6] Overview status event");
	const { data: evs } = await sb
		.from("events")
		.select("status")
		.is("deleted_at", null);
	const byStatus: Record<string, number> = {};
	for (const e of evs ?? []) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
	console.log("  " + JSON.stringify(byStatus));

	console.log(
		`\n${"=".repeat(60)}\nHASIL: ${pass} cek PASS, ${fail} masalah${fail > 0 ? ":\n  - " + issues.join("\n  - ") : " ✅ SEMUA SEHAT"}`,
	);
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
