/**
 * Verifikasi & test driver untuk migration rekap pass 1 + 2.
 *
 * Pakai SUPABASE_SERVICE_ROLE_KEY → bypass RLS, jalan sebagai admin.
 *
 * Usage (Node 20+):
 *   npx tsx --env-file=.env.local scripts/verify-rekap.ts check
 *   npx tsx --env-file=.env.local scripts/verify-rekap.ts list-events
 *   npx tsx --env-file=.env.local scripts/verify-rekap.ts settle <project-id>
 *   npx tsx --env-file=.env.local scripts/verify-rekap.ts inspect <project-id>
 *   npx tsx --env-file=.env.local scripts/verify-rekap.ts reopen <project-id> "<reason>"
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error("❌ Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
	process.exit(1);
}

const sb = createClient(url, key, {
	auth: { persistSession: false, autoRefreshToken: false },
});

// ─── pretty print helpers ────────────────────────────────────────────────────
const c = {
	dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};
const ok = (msg: string) => console.log(`  ${c.green("✓")} ${msg}`);
const fail = (msg: string) => console.log(`  ${c.red("✗")} ${msg}`);
const warn = (msg: string) => console.log(`  ${c.yellow("⚠")} ${msg}`);
const info = (msg: string) => console.log(`  ${c.dim(msg)}`);
const heading = (msg: string) => console.log(`\n${c.bold(c.cyan(msg))}`);
const rupiah = (n: number) =>
	n.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

// ─── commands ────────────────────────────────────────────────────────────────

async function cmdCheck() {
	console.log(c.bold("\n📋 Fase 2 — Verifikasi migration"));

	// Query 1: chart_of_accounts seed
	heading("1. Chart of accounts seed");
	const { data: coa, error: coaErr } = await sb
		.from("chart_of_accounts")
		.select("account_type");
	if (coaErr) {
		fail(`Query gagal: ${coaErr.message}`);
	} else {
		const counts: Record<string, number> = {};
		for (const r of coa ?? []) counts[r.account_type] = (counts[r.account_type] ?? 0) + 1;
		const types = Object.keys(counts).sort();
		if (types.length !== 5) {
			fail(`Cuma ${types.length} account_type ditemukan, harusnya 5 (asset/liability/equity/revenue/expense)`);
		} else {
			ok(`5 account_type lengkap. Total ${coa?.length ?? 0} akun.`);
		}
		for (const t of types) info(`${t.padEnd(12)} ${counts[t]} akun`);
	}

	// Query 2: frame_size_mapping seed
	heading("2. Frame size mapping seed");
	const { data: fsm, error: fsmErr } = await sb
		.from("frame_size_mapping")
		.select("frame_size, mediaset_type, mediaset_per_print, prints_per_mediaset")
		.order("frame_size");
	if (fsmErr) {
		fail(`Query gagal: ${fsmErr.message}`);
	} else if (!fsm || fsm.length === 0) {
		fail("Tabel kosong — seed tidak ter-apply");
	} else {
		ok(`${fsm.length} baris (harapkan 3: 4R/2R/polaroid)`);
		for (const r of fsm) {
			info(
				`${r.frame_size.padEnd(8)} → ${r.mediaset_type.padEnd(10)} · ${r.mediaset_per_print}/print · ${r.prints_per_mediaset} prints/mediaset`,
			);
		}
	}

	// Query 3: backfill proof photos cross-check
	heading("3. Backfill proof photos cross-check");
	const { count: proofsCount, error: pcErr } = await sb
		.from("event_recap_proofs")
		.select("*", { count: "exact", head: true });
	if (pcErr) {
		fail(`Query gagal: ${pcErr.message}`);
	} else {
		const { data: legacyData } = await sb
			.from("crew_rekap")
			.select("proof_photo_urls");
		const legacyTotal = (legacyData ?? []).reduce(
			(s, r) => s + (r.proof_photo_urls?.length ?? 0),
			0,
		);
		const tableTotal = proofsCount ?? 0;
		if (tableTotal === legacyTotal) {
			ok(`Match: ${tableTotal} rows di event_recap_proofs = ${legacyTotal} di legacy array`);
		} else {
			warn(`Mismatch: ${tableTotal} rows di event_recap_proofs vs ${legacyTotal} di legacy array (selisih ${tableTotal - legacyTotal})`);
		}
	}

	// Query 4: backfill misc expenses cross-check
	heading("4. Backfill misc expenses cross-check");
	const { count: miscCount, error: meErr } = await sb
		.from("event_recap_misc_expenses")
		.select("*", { count: "exact", head: true });
	if (meErr) {
		fail(`Query gagal: ${meErr.message}`);
	} else {
		const { data: legacyData } = await sb.from("crew_rekap").select("lainnya_items");
		const legacyTotal = (legacyData ?? []).reduce(
			(s, r) => s + (Array.isArray(r.lainnya_items) ? r.lainnya_items.length : 0),
			0,
		);
		const tableTotal = miscCount ?? 0;
		if (tableTotal === legacyTotal) {
			ok(`Match: ${tableTotal} rows di event_recap_misc_expenses = ${legacyTotal} di legacy JSONB`);
		} else {
			warn(`Mismatch: ${tableTotal} vs ${legacyTotal} (selisih ${tableTotal - legacyTotal})`);
		}
	}

	// Query 5: functions exist
	heading("5. Functions terbuat");
	const expected = [
		"calculate_recap_hpp",
		"calculate_recap_opex",
		"generate_journal_reference",
		"reopen_settlement",
		"settle_event",
		"_create_settlement_journal",
		"_validate_recap_stock_sufficient",
	];
	// Pakai test call ke generate_journal_reference (low side-effect) untuk konfirmasi callable
	const { data: refTest, error: refErr } = await sb.rpc("generate_journal_reference");
	if (refErr) {
		fail(`generate_journal_reference RPC error: ${refErr.message}`);
	} else {
		ok(`generate_journal_reference() callable → ${refTest}`);
	}
	// Untuk function lain, kita tidak bisa enumerate via Data API, jadi assume kalau migration apply success, semua exist.
	info(`Expected functions (assumed present jika migration #7 & #8 success): ${expected.join(", ")}`);

	// Bonus: cek extend columns
	heading("6. Extend columns di crew_rekap & crew_assignments");
	const { data: crSample, error: crErr } = await sb
		.from("crew_rekap")
		.select(
			"id, status, locked, photomagnet_paid, photomagnet_bonus, keychain_paid, keychain_bonus, frame_size_snapshot",
		)
		.limit(1);
	if (crErr) {
		fail(`crew_rekap select gagal (kolom missing?): ${crErr.message}`);
	} else {
		ok("crew_rekap punya kolom: status, locked, photomagnet_paid/bonus, keychain_paid/bonus, frame_size_snapshot");
	}

	const { data: caSample, error: caErr } = await sb
		.from("crew_assignments")
		.select("id, reimbursement_amount, total_fee, payment_notes")
		.limit(1);
	if (caErr) {
		fail(`crew_assignments select gagal: ${caErr.message}`);
	} else {
		ok("crew_assignments punya kolom: reimbursement_amount, total_fee (generated), payment_notes");
	}

	// crew_rekap status distribution
	const { data: statusDist } = await sb.from("crew_rekap").select("status");
	if (statusDist) {
		const dist: Record<string, number> = {};
		for (const r of statusDist) dist[r.status] = (dist[r.status] ?? 0) + 1;
		info(`crew_rekap status distribution: ${JSON.stringify(dist)}`);
	}

	console.log(c.bold(c.green("\n✅ Fase 2 verifikasi selesai.\n")));
}

async function cmdListEvents() {
	console.log(c.bold("\n📅 Event yang cocok untuk test settle"));
	info("Filter: status='awaiting_settlement' atau 'in_progress', ada crew_rekap.\n");

	const { data, error } = await sb
		.from("events")
		.select(
			`id, project_id, status, client_name, event_date, grand_total,
			crew_rekap:crew_rekap(id, status, is_approved, photomagnet_used, keychain_used,
			                     proof_photo_urls)`,
		)
		.in("status", ["in_progress", "awaiting_settlement"])
		.order("event_date", { ascending: false })
		.limit(30);

	if (error) {
		console.error(c.red(`Error: ${error.message}`));
		return;
	}
	if (!data || data.length === 0) {
		warn("Tidak ada event status 'in_progress' atau 'awaiting_settlement'.");
		warn("Coba ubah event di Supabase Studio → tabel events → ubah salah satu event ke status 'awaiting_settlement' untuk test.");
		return;
	}

	for (const ev of data) {
		const cr = Array.isArray(ev.crew_rekap) ? ev.crew_rekap[0] : ev.crew_rekap;
		const proofs = cr?.proof_photo_urls?.length ?? 0;
		const recapStatus = cr ? `recap=${cr.status} approved=${cr.is_approved}` : "NO RECAP";
		const settleReady = cr && (cr.is_approved === true || cr.status === "reviewed");
		const marker = settleReady ? c.green("●") : c.yellow("○");
		console.log(
			`  ${marker} ${c.bold(ev.project_id)} · ${ev.client_name} · ${ev.event_date}`,
		);
		info(
			`     status=${ev.status} · revenue=${rupiah(Number(ev.grand_total ?? 0))} · ${recapStatus} · proofs=${proofs}`,
		);
	}
	console.log("");
	info(c.green("●") + " = recap approved, siap settle    " + c.yellow("○") + " = belum siap (approve dulu)");
	info("Untuk settle: npx tsx --env-file=.env.local scripts/verify-rekap.ts settle <project-id>");
}

async function cmdSettle(projectId: string) {
	console.log(c.bold(`\n🚀 Settle event ${projectId}`));

	// Resolve event id
	const { data: ev, error: evErr } = await sb
		.from("events")
		.select("id, status, client_name, grand_total")
		.eq("project_id", projectId)
		.maybeSingle();
	if (evErr || !ev) {
		console.error(c.red(`Event ${projectId} tidak ditemukan: ${evErr?.message ?? ""}`));
		process.exit(1);
	}
	info(`Event found: ${ev.client_name} · status=${ev.status} · grand_total=${rupiah(Number(ev.grand_total ?? 0))}`);

	// Resolve super_admin owner_user_id (pakai untuk actor)
	const { data: admins, error: admErr } = await sb
		.from("users")
		.select("id, full_name, email, role")
		.in("role", ["super_admin", "owner"])
		.eq("is_active", true)
		.order("role")
		.limit(1);
	if (admErr || !admins || admins.length === 0) {
		console.error(c.red("Tidak ada super_admin/owner aktif di users."));
		process.exit(1);
	}
	const actor = admins[0];
	info(`Actor: ${actor.full_name} (${actor.email}, role=${actor.role})`);

	// Pre-flight stock check (extra info)
	const { data: rekap } = await sb
		.from("crew_rekap")
		.select("id")
		.eq("event_id", ev.id)
		.maybeSingle();
	if (rekap?.id) {
		const { data: stockCheck, error: scErr } = await sb.rpc(
			"_validate_recap_stock_sufficient",
			{ p_recap_id: rekap.id },
		);
		if (scErr) {
			warn(`Stock check error: ${scErr.message}`);
		} else if (stockCheck && !stockCheck.sufficient) {
			console.log(c.red("\n  ✗ Stock tidak cukup. Settlement diblokir."));
			for (const s of stockCheck.shortages ?? []) {
				console.log(`    · ${s.sku} (${s.name}): butuh ${s.needed}, ada ${s.available}, kurang ${s.shortage}`);
			}
			process.exit(2);
		} else {
			ok("Stock cukup");
		}
	}

	// Call settle_event RPC
	heading("Calling settle_event() RPC...");
	const { data: result, error: rpcErr } = await sb.rpc("settle_event", {
		p_event_id: ev.id,
		p_owner_user_id: actor.id,
		p_overrides: null,
	});
	if (rpcErr) {
		console.error(c.red(`\n❌ RPC error: ${rpcErr.message}`));
		if (rpcErr.details) console.error(c.dim(`   ${rpcErr.details}`));
		process.exit(1);
	}

	const r = result as {
		settlement_id: string;
		journal_entry_id: string;
		stock_batch_id: string;
		revenue_net: number;
		hpp_total: number;
		opex_total: number;
		net_profit: number;
		margin_pct: number;
		is_loss: boolean;
		sinking_total: number;
		owner_pool_total: number;
		operating_cash: number;
	};
	console.log(c.bold(c.green("\n✅ Settlement berhasil!")));
	ok(`settlement_id: ${r.settlement_id}`);
	ok(`journal_entry_id: ${r.journal_entry_id}`);
	ok(`stock_batch_id: ${r.stock_batch_id}`);
	console.log("");
	info(`Revenue net:        ${rupiah(r.revenue_net)}`);
	info(`HPP total:          ${rupiah(r.hpp_total)}`);
	info(`OpEx total:         ${rupiah(r.opex_total)}`);
	info(`Net profit:         ${rupiah(r.net_profit)}  (${r.margin_pct}% margin)`);
	if (r.is_loss) warn("Event ini RUGI — tidak ada alokasi sinking/owner pool");
	info(`Sinking total:      ${rupiah(r.sinking_total)}`);
	info(`Owner pool total:   ${rupiah(r.owner_pool_total)}`);
	info(`Operating cash:     ${rupiah(r.operating_cash)}`);
	console.log("");
	info(`Untuk verifikasi: npx tsx --env-file=.env.local scripts/verify-rekap.ts inspect ${projectId}`);
}

async function cmdInspect(projectId: string) {
	console.log(c.bold(`\n🔍 Inspect settlement ${projectId}`));

	const { data: ev } = await sb
		.from("events")
		.select("id, status, project_id")
		.eq("project_id", projectId)
		.maybeSingle();
	if (!ev) {
		console.error(c.red(`Event ${projectId} tidak ditemukan`));
		process.exit(1);
	}

	// A. Settlement record
	heading("A. event_settlements");
	const { data: s, error: sErr } = await sb
		.from("event_settlements")
		.select(
			"id, revenue_net, hpp_total, opex_total, net_profit, is_loss, journal_entry_id, closed_at, is_reopened, reopen_reason",
		)
		.eq("event_id", ev.id)
		.maybeSingle();
	if (sErr) fail(sErr.message);
	else if (!s) fail("Tidak ada row di event_settlements");
	else {
		ok(`id=${s.id}`);
		info(`revenue_net=${rupiah(s.revenue_net)}, hpp=${rupiah(s.hpp_total)}, opex=${rupiah(s.opex_total)}`);
		info(`net_profit=${rupiah(s.net_profit)} (is_loss=${s.is_loss})`);
		info(`journal_entry_id=${s.journal_entry_id ?? c.red("NULL ❌")}`);
		info(`closed_at=${s.closed_at}`);
		info(`is_reopened=${s.is_reopened}${s.reopen_reason ? ` (reason: ${s.reopen_reason})` : ""}`);
	}

	// B. Stock movements
	heading("B. stock_movements (source=settlement)");
	const { data: sm, error: smErr } = await sb
		.from("stock_movements")
		.select(
			"ref_id, direction, quantity, unit_cost, created_at, item:inventory_items(sku, name)",
		)
		.eq("source", "settlement")
		.eq("source_id", ev.id)
		.order("created_at", { ascending: false });
	if (smErr) fail(smErr.message);
	else if (!sm || sm.length === 0) warn("Tidak ada stock movement");
	else {
		ok(`${sm.length} movements`);
		for (const m of sm.slice(0, 10)) {
			const item = Array.isArray(m.item) ? m.item[0] : m.item;
			info(
				`${m.direction.padEnd(4)} ${m.quantity.toString().padStart(4)} · ${item?.sku ?? "?"} (${item?.name ?? "?"}) @ ${rupiah(Number(m.unit_cost ?? 0))}`,
			);
		}
		if (sm.length > 10) info(`... ${sm.length - 10} more`);
	}

	// C. Journal entries + double-entry check
	heading("C. journal_entries + double-entry balance");
	const { data: jes } = await sb
		.from("journal_entries")
		.select("id, ref_id, entry_type, total_amount, is_reversed, created_at")
		.eq("source_event_id", ev.id)
		.order("created_at");
	if (!jes || jes.length === 0) fail("Tidak ada journal entry");
	else {
		for (const je of jes) {
			const { data: lines } = await sb
				.from("journal_lines")
				.select("debit_amount, credit_amount")
				.eq("entry_id", je.id);
			const sumD = (lines ?? []).reduce((s, l) => s + Number(l.debit_amount ?? 0), 0);
			const sumC = (lines ?? []).reduce((s, l) => s + Number(l.credit_amount ?? 0), 0);
			const balanced = sumD === sumC;
			const symbol = balanced ? c.green("✓") : c.red("✗");
			console.log(
				`  ${symbol} ${je.ref_id} (${je.entry_type}) · total=${rupiah(Number(je.total_amount))} · lines=${lines?.length ?? 0} · debit=${rupiah(sumD)} credit=${rupiah(sumC)}${je.is_reversed ? c.yellow(" [REVERSED]") : ""}`,
			);
			if (!balanced) {
				console.log(c.red(`    DOUBLE-ENTRY MISMATCH: debit ≠ credit`));
			}
		}
	}

	// D. Sinking fund movements
	heading("D. sinking_fund_movements");
	const { data: sfm } = await sb
		.from("sinking_fund_movements")
		.select("movement_type, amount, created_at, fund:sinking_funds(name, code)")
		.eq("source_event_id", ev.id)
		.order("created_at");
	if (!sfm || sfm.length === 0) info("Tidak ada (mungkin event rugi)");
	else {
		ok(`${sfm.length} movements`);
		for (const m of sfm) {
			const fund = Array.isArray(m.fund) ? m.fund[0] : m.fund;
			info(`${m.movement_type.padEnd(10)} ${rupiah(Number(m.amount))} → ${fund?.name ?? "?"} (${fund?.code ?? "?"})`);
		}
	}

	// E. Owner earnings
	heading("E. owner_earnings");
	const { data: oe } = await sb
		.from("owner_earnings")
		.select("earning_type, amount, created_at, owner:users!owner_earnings_owner_user_id_fkey(full_name)")
		.eq("source_event_id", ev.id);
	if (!oe || oe.length === 0) info("Tidak ada (mungkin event rugi)");
	else {
		ok(`${oe.length} entries`);
		for (const e of oe) {
			const owner = Array.isArray(e.owner) ? e.owner[0] : e.owner;
			info(`${e.earning_type.padEnd(14)} ${rupiah(Number(e.amount))} → ${owner?.full_name ?? "?"}`);
		}
	}

	// F. Event + recap status
	heading("F. event + crew_rekap status");
	const { data: cr } = await sb
		.from("crew_rekap")
		.select("status, locked, locked_at, settled_at")
		.eq("event_id", ev.id)
		.maybeSingle();
	const expectStatus = "completed";
	const expectRecapStatus = "settled";
	const expectLocked = true;
	if (ev.status === expectStatus) ok(`events.status = ${ev.status}`);
	else fail(`events.status = ${ev.status}, harusnya ${expectStatus}`);
	if (cr) {
		if (cr.status === expectRecapStatus) ok(`crew_rekap.status = ${cr.status}`);
		else fail(`crew_rekap.status = ${cr.status}, harusnya ${expectRecapStatus}`);
		if (cr.locked === expectLocked) ok(`crew_rekap.locked = true`);
		else fail(`crew_rekap.locked = ${cr.locked}, harusnya true`);
		info(`locked_at=${cr.locked_at}, settled_at=${cr.settled_at}`);
	} else {
		warn("crew_rekap tidak ditemukan");
	}

	console.log(c.bold(c.green("\n✅ Inspect selesai.\n")));
}

async function cmdTestRls() {
	console.log(c.bold("\n🔐 Test RLS policies di crew_rekap (post-fix)\n"));

	// 1. Find owner user
	const { data: owners } = await sb
		.from("users")
		.select("id, full_name, role")
		.in("role", ["super_admin", "owner"])
		.eq("is_active", true)
		.limit(1);
	if (!owners?.length) {
		fail("Tidak ada super_admin/owner aktif");
		process.exit(1);
	}
	const owner = owners[0];
	info(`Owner: ${owner.full_name} (${owner.role})`);

	// 2. Find event without crew_rekap
	const { data: events } = await sb
		.from("events")
		.select("id, project_id, status")
		.in("status", ["in_progress", "awaiting_settlement"])
		.limit(20);

	let targetEvent: { id: string; project_id: string } | null = null;
	for (const ev of events ?? []) {
		const { data: existingRekap } = await sb
			.from("crew_rekap")
			.select("id")
			.eq("event_id", ev.id)
			.maybeSingle();
		if (!existingRekap) {
			targetEvent = ev;
			break;
		}
	}
	if (!targetEvent) {
		warn("Tidak ada event tanpa crew_rekap untuk test. Skip insert simulation.");
		return;
	}
	info(`Target event: ${targetEvent.project_id} (id=${targetEvent.id})`);

	// 3. Note: service role bypasses RLS — kita gak bisa benar-benar test RLS dari script
	//    karena script jalan as postgres role. Tapi kita bisa verify policy DEFINITION.
	warn("Service role bypass RLS — script ini cuma cek policy structure, bukan actual RLS enforcement.");
	warn("Untuk verify actual RLS: test manual login owner di UI.");

	// 4. List policies via pg_policies (note: pg_policies bisa di-query via PostgREST? probably not)
	//    Workaround: try a meta-query via known-allowed endpoint
	//    Actually we CAN'T query pg_policies via PostgREST — itu butuh anon role / authenticated.
	//    Skip; cuma laporkan apa yang ada di migration source.

	console.log(c.bold(c.cyan("\nExpected policies after migration apply:")));
	info("  crew_rekap_read    (existing, SELECT)");
	info("  crew_rekap_insert  (NEW, INSERT) — owner OR assigned crew");
	info("  crew_rekap_update  (NEW, UPDATE) — (owner OR submitter) AND NOT locked");
	info("  crew_rekap_delete  (NEW, DELETE) — owner AND NOT locked");
	console.log("");
	info("Untuk verify dari SQL Editor, run:");
	info("  SELECT policyname, cmd FROM pg_policies");
	info("  WHERE schemaname='public' AND tablename='crew_rekap' ORDER BY policyname;");
}

async function cmdCleanupReopened(projectId: string) {
	console.log(c.bold(`\n🧹 Cleanup reopened settlement: ${projectId}`));

	const { data: ev } = await sb
		.from("events")
		.select("id")
		.eq("project_id", projectId)
		.maybeSingle();
	if (!ev) {
		console.error(c.red(`Event ${projectId} tidak ditemukan`));
		process.exit(1);
	}

	const { data: settlement } = await sb
		.from("event_settlements")
		.select("id, is_reopened, closed_at")
		.eq("event_id", ev.id)
		.maybeSingle();

	if (!settlement) {
		info("Tidak ada settlement untuk event ini — nothing to cleanup");
		return;
	}
	if (!settlement.is_reopened) {
		warn(`Settlement (${settlement.id}) belum di-reopen. Skip cleanup untuk safety.`);
		warn("Kalau benar-benar mau hapus, run: reopen dulu, baru cleanup.");
		return;
	}

	info(`Found reopened settlement ${settlement.id} (closed_at=${settlement.closed_at})`);
	info("Akan NULL out FK references → DELETE settlement row.");

	// NULL out FK references in dependent tables (preserve audit trail of movements)
	const sid = settlement.id;
	const { error: e1 } = await sb
		.from("sinking_fund_movements")
		.update({ source_settlement_id: null })
		.eq("source_settlement_id", sid);
	if (e1) { fail(`Null sinking refs: ${e1.message}`); process.exit(1); }
	ok("sinking_fund_movements.source_settlement_id → NULL");

	const { error: e2 } = await sb
		.from("owner_earnings")
		.update({ source_settlement_id: null })
		.eq("source_settlement_id", sid);
	if (e2) { fail(`Null owner_earnings refs: ${e2.message}`); process.exit(1); }
	ok("owner_earnings.source_settlement_id → NULL");

	// Detach event_settlements.journal_entry_id (DB doesn't have FK constraint on this column,
	// but safer to NULL it before deleting settlement). Journal entries themselves stay.
	const { error: e3 } = await sb
		.from("event_settlements")
		.update({ journal_entry_id: null })
		.eq("id", sid);
	if (e3) warn(`Null journal_entry_id (non-fatal): ${e3.message}`);

	const { error: delErr } = await sb
		.from("event_settlements")
		.delete()
		.eq("id", sid);
	if (delErr) {
		fail(`Delete gagal: ${delErr.message}`);
		process.exit(1);
	}
	ok("Settlement row deleted. event_id UNIQUE bebas untuk re-settle.");
}

async function cmdDemo(projectId: string) {
	console.log(c.bold(`\n🧪 DEMO end-to-end test: ${projectId}\n`));
	console.log(c.dim("  Steps: seed crew_rekap → approve → set crew fees → settle → inspect\n"));

	// 1. Resolve event
	const { data: ev, error: evErr } = await sb
		.from("events")
		.select("id, project_id, status, client_name, event_date, frame_size, grand_total")
		.eq("project_id", projectId)
		.maybeSingle();
	if (evErr || !ev) {
		console.error(c.red(`Event ${projectId} tidak ditemukan: ${evErr?.message ?? ""}`));
		process.exit(1);
	}
	ok(`Event: ${ev.client_name} · ${ev.event_date} · ${ev.frame_size} · ${rupiah(Number(ev.grand_total ?? 0))}`);

	if (!["in_progress", "awaiting_settlement"].includes(ev.status)) {
		fail(`Status event = '${ev.status}'. Harusnya in_progress atau awaiting_settlement. Update status di Supabase Studio dulu, atau pilih event lain.`);
		process.exit(1);
	}

	// 2. Cek existing settlement
	const { data: existSett } = await sb
		.from("event_settlements")
		.select("id, is_reopened")
		.eq("event_id", ev.id)
		.maybeSingle();
	if (existSett && !existSett.is_reopened) {
		fail(`Event sudah punya settlement (${existSett.id}) dan belum di-reopen. Reopen dulu atau pilih event lain.`);
		process.exit(1);
	}

	// 3. Resolve actor (super_admin atau owner pertama)
	const { data: admins } = await sb
		.from("users")
		.select("id, full_name, role")
		.in("role", ["super_admin", "owner"])
		.eq("is_active", true)
		.order("role")
		.limit(1);
	if (!admins?.length) {
		fail("Tidak ada super_admin/owner aktif");
		process.exit(1);
	}
	const actor = admins[0];
	ok(`Actor: ${actor.full_name} (${actor.role})`);

	// 4. Cek crew_assignments
	const { data: assignments } = await sb
		.from("crew_assignments")
		.select("id, role_in_event, fee_amount, user:users!crew_assignments_user_id_fkey(full_name)")
		.eq("event_id", ev.id);
	if (!assignments?.length) {
		fail("Event tidak punya crew_assignments. Tambah crew dulu via Supabase Studio atau UI.");
		process.exit(1);
	}
	ok(`${assignments.length} crew assigned`);
	for (const a of assignments) {
		const u = Array.isArray(a.user) ? a.user[0] : a.user;
		info(`${a.role_in_event.padEnd(8)} ${u?.full_name ?? "?"} · current fee=${rupiah(Number(a.fee_amount ?? 0))}`);
	}

	// 5. Seed crew_rekap
	heading("Step 1: Seed crew_rekap");
	const { data: existRekap } = await sb
		.from("crew_rekap")
		.select("id")
		.eq("event_id", ev.id)
		.maybeSingle();

	let recapId: string;
	const seedRekapPayload = {
		event_id: ev.id,
		submitted_by: actor.id,
		cetak_total: 200,
		media_set_used: 1,
		sleeve_used: 200,
		flashdisk_used: 1,
		pouch_used: 1,
		photomagnet_used: 0,
		keychain_used: 0,
		custom_materials: {},
		proof_photo_urls: ["https://example.com/demo-proof-counter-dslr.jpg"],
		crew_notes: "[DEMO] Seeded by verify-rekap.ts e2e test",
		transport_method: "online",
		transport_cost: 50_000,
		bensin_cost: 0,
		toll_cost: 0,
		parking_cost: 10_000,
		konsumsi_cost: 75_000,
		lainnya_items: [],
		frame_size_snapshot: ev.frame_size,
		status: "reviewed" as const,
		is_approved: true,
		reviewed_by: actor.id,
		reviewed_at: new Date().toISOString(),
		photomagnet_paid: 0,
		photomagnet_bonus: 0,
		keychain_paid: 0,
		keychain_bonus: 0,
	};

	if (existRekap) {
		recapId = existRekap.id;
		const { error } = await sb
			.from("crew_rekap")
			.update(seedRekapPayload)
			.eq("id", recapId);
		if (error) { fail(`Update crew_rekap gagal: ${error.message}`); process.exit(1); }
		ok(`crew_rekap updated (id=${recapId})`);
	} else {
		const { data: newRekap, error } = await sb
			.from("crew_rekap")
			.insert(seedRekapPayload)
			.select("id")
			.single();
		if (error || !newRekap) { fail(`Insert crew_rekap gagal: ${error?.message ?? "?"}`); process.exit(1); }
		recapId = newRekap.id;
		ok(`crew_rekap inserted (id=${recapId})`);
	}

	// 6. Insert 1 event_recap_proof
	const { data: existProofs } = await sb
		.from("event_recap_proofs")
		.select("id")
		.eq("recap_id", recapId)
		.limit(1);
	if (!existProofs?.length) {
		const { error: pErr } = await sb.from("event_recap_proofs").insert({
			recap_id: recapId,
			photo_url: "https://example.com/demo-proof-counter-dslr.jpg",
			photo_type: "counter_dslr",
			caption: "[DEMO] Counter DSLR end of event",
			uploaded_by: actor.id,
		});
		if (pErr) warn(`Insert proof gagal (mungkin RLS): ${pErr.message}`);
		else ok("1 event_recap_proof inserted");
	} else {
		info(`Proof sudah ada (${existProofs.length} rows)`);
	}

	// 7. Set crew fees (kalau 0)
	heading("Step 2: Set crew fees (kalau 0)");
	const defaultFees: Record<string, number> = { lead: 350_000, asisten: 250_000, crew_c: 200_000 };
	for (const a of assignments) {
		if (Number(a.fee_amount ?? 0) === 0) {
			const newFee = defaultFees[a.role_in_event] ?? 200_000;
			const { error: feeErr } = await sb
				.from("crew_assignments")
				.update({ fee_amount: newFee })
				.eq("id", a.id);
			if (feeErr) fail(`Update fee gagal: ${feeErr.message}`);
			else ok(`${a.role_in_event} fee → ${rupiah(newFee)}`);
		} else {
			info(`${a.role_in_event} fee sudah ada: ${rupiah(Number(a.fee_amount))}`);
		}
	}

	// 8. Stock sufficiency
	heading("Step 3: Cek stok");
	const { data: stockCheck } = await sb.rpc("_validate_recap_stock_sufficient", {
		p_recap_id: recapId,
	});
	if (stockCheck && !stockCheck.sufficient) {
		warn("Stok tidak cukup:");
		for (const s of stockCheck.shortages ?? []) {
			console.log(`    · ${s.sku}: butuh ${s.needed}, ada ${s.available}, kurang ${s.shortage}`);
		}
		warn("Demo dilanjutkan dengan adjust stock — saya tambah stok via stock_movements 'in' adjustment dummy.");
		for (const s of stockCheck.shortages ?? []) {
			const refId = `SM-DEMO-${Date.now().toString().slice(-6)}-${s.sku}`;
			await sb.from("stock_movements").insert({
				ref_id: refId,
				item_id: s.item_id,
				direction: "in",
				quantity: Math.ceil(s.shortage) + 10,
				unit_cost: 0,
				source: "manual_adjust",
				source_description: "[DEMO] Auto top-up untuk verify-rekap demo",
				performed_by: actor.id,
			});
		}
		info("Stok di-top-up. Re-cek...");
		const { data: stockCheck2 } = await sb.rpc("_validate_recap_stock_sufficient", {
			p_recap_id: recapId,
		});
		if (!stockCheck2?.sufficient) {
			fail("Stok masih kurang setelah top-up. Stop demo.");
			process.exit(1);
		}
	}
	ok("Stok cukup");

	// 9. Settle!
	heading("Step 4: Call settle_event() RPC");
	const { data: settleResult, error: settleErr } = await sb.rpc("settle_event", {
		p_event_id: ev.id,
		p_owner_user_id: actor.id,
		p_overrides: null,
	});
	if (settleErr) {
		console.error(c.red(`\n❌ settle_event RPC error: ${settleErr.message}`));
		if (settleErr.details) console.error(c.dim(`   ${settleErr.details}`));
		process.exit(1);
	}
	const r = settleResult as {
		settlement_id: string;
		journal_entry_id: string;
		stock_batch_id: string;
		revenue_net: number;
		hpp_total: number;
		opex_total: number;
		net_profit: number;
		margin_pct: number;
		is_loss: boolean;
		sinking_total: number;
		owner_pool_total: number;
		operating_cash: number;
	};
	ok(`Settlement berhasil! id=${r.settlement_id}`);
	info(`journal_entry_id=${r.journal_entry_id}, stock_batch_id=${r.stock_batch_id}`);
	info(`revenue_net=${rupiah(r.revenue_net)}, hpp=${rupiah(r.hpp_total)}, opex=${rupiah(r.opex_total)}`);
	info(`net_profit=${rupiah(r.net_profit)} (${r.margin_pct}%) is_loss=${r.is_loss}`);
	info(`sinking=${rupiah(r.sinking_total)}, owner_pool=${rupiah(r.owner_pool_total)}, op_cash=${rupiah(r.operating_cash)}`);

	// 10. Inspect
	console.log(c.bold(c.cyan("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")));
	await cmdInspect(projectId);

	console.log(c.bold(c.green(`\n✅ DEMO selesai untuk ${projectId}.`)));
	info("Untuk reverse (cleanup): npx tsx ... reopen " + projectId + ' "demo cleanup"');
}

async function cmdReopen(projectId: string, reason: string) {
	console.log(c.bold(`\n↩️  Reopen settlement ${projectId}`));

	const { data: ev } = await sb
		.from("events")
		.select("id, status")
		.eq("project_id", projectId)
		.maybeSingle();
	if (!ev) {
		console.error(c.red(`Event ${projectId} tidak ditemukan`));
		process.exit(1);
	}

	const { data: admins } = await sb
		.from("users")
		.select("id, full_name, role")
		.eq("role", "super_admin")
		.eq("is_active", true)
		.limit(1);
	if (!admins || admins.length === 0) {
		console.error(c.red("Tidak ada super_admin aktif (reopen butuh super_admin)"));
		process.exit(1);
	}
	const actor = admins[0];
	info(`Actor: ${actor.full_name}`);
	info(`Reason: ${reason}`);

	const { data: result, error: rpcErr } = await sb.rpc("reopen_settlement", {
		p_event_id: ev.id,
		p_owner_user_id: actor.id,
		p_reason: reason,
	});
	if (rpcErr) {
		console.error(c.red(`\n❌ RPC error: ${rpcErr.message}`));
		process.exit(1);
	}

	const r = result as {
		settlement_id: string;
		reversal_journal_id: string | null;
		reversal_stock_batch: string;
		reason: string;
	};
	console.log(c.bold(c.green("\n✅ Reopen berhasil!")));
	ok(`settlement_id: ${r.settlement_id}`);
	ok(`reversal_journal_id: ${r.reversal_journal_id ?? "(none)"}`);
	ok(`reversal_stock_batch: ${r.reversal_stock_batch}`);
	info(`reason: ${r.reason}`);
	console.log("");
	info(`Untuk verifikasi: npx tsx --env-file=.env.local scripts/verify-rekap.ts inspect ${projectId}`);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
	const [cmd, ...args] = process.argv.slice(2);
	switch (cmd) {
		case "check":
			await cmdCheck();
			break;
		case "list-events":
			await cmdListEvents();
			break;
		case "settle":
			if (!args[0]) {
				console.error("Usage: settle <project-id>");
				process.exit(1);
			}
			await cmdSettle(args[0]);
			break;
		case "inspect":
			if (!args[0]) {
				console.error("Usage: inspect <project-id>");
				process.exit(1);
			}
			await cmdInspect(args[0]);
			break;
		case "reopen":
			if (!args[0] || !args[1]) {
				console.error('Usage: reopen <project-id> "<reason>"');
				process.exit(1);
			}
			await cmdReopen(args[0], args[1]);
			break;
		case "demo":
			if (!args[0]) {
				console.error("Usage: demo <project-id>");
				process.exit(1);
			}
			await cmdDemo(args[0]);
			break;
		case "cleanup-reopened":
			if (!args[0]) {
				console.error("Usage: cleanup-reopened <project-id>");
				process.exit(1);
			}
			await cmdCleanupReopened(args[0]);
			break;
		default:
			console.log("Commands:");
			console.log("  check                          — Fase 2 verifikasi migration");
			console.log("  list-events                    — list event eligible untuk settle");
			console.log("  demo <project-id>              — full e2e: seed + approve + settle + inspect");
			console.log("  settle <project-id>            — call settle_event RPC (no seed)");
			console.log("  inspect <project-id>           — Fase 5 verifikasi settlement");
			console.log('  reopen <project-id> "<reason>" — call reopen_settlement RPC');
			process.exit(1);
	}
}

main().catch((err) => {
	console.error(c.red("\n❌ Unhandled error:"), err);
	process.exit(1);
});
