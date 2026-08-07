/**
 * QA — jalankan satu siklus rekap penuh di database sungguhan, lalu kembalikan
 * semuanya seperti semula.
 *
 *   1. buat event uji ("ZZ TEST …") + 2 crew
 *   2. crew mengisi rekap: bahan terpakai + biaya lapangan (ada yang ditalangi
 *      crew, ada yang dibayar owner)
 *   3. samakan talangan crew (src/lib/rekap/reimbursement.ts — jalur yang sama
 *      dipakai settleEvent)
 *   4. owner settle lewat RPC settle_event yang asli
 *   5. periksa: jurnal balance, utang crew = yang bisa dibayar, bagi hasil,
 *      laba, dan penanda di rekap
 *   6. bersih-bersih: hapus seluruh baris uji dengan urutan yang menghormati
 *      foreign key, lalu buktikan saldo kas/bank + 2-100 kembali ke semula
 *
 * MENULIS ke database. Semua yang dibuat berawalan "ZZ TEST" dan dihapus di
 * akhir; kalau di tengah gagal, bagian bersih-bersih tetap dijalankan.
 *
 * Pakai: npx tsx scripts/qa-rekap-e2e.mts [--keep]
 *   --keep  jangan bersih-bersih (untuk memeriksa hasilnya manual)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Modul aplikasi dipakai apa adanya supaya yang diuji benar-benar jalur yang
// dipakai settleEvent. Path lewat variabel: dengan literal, tsc menolak
// ekstensi .ts (TS5097) padahal tsx justru membutuhkannya saat runtime.
const REIMBURSEMENT_MODULE = "../src/lib/rekap/reimbursement.ts";
const { crewFrontedExpenses, syncCrewReimbursement } = await import(
	REIMBURSEMENT_MODULE
);

const KEEP = process.argv.includes("--keep");
const TAG = "ZZ TEST REKAP E2E";

const env = Object.fromEntries(
	readFileSync("./.env.local", "utf8")
		.split("\n")
		.filter((l) => l.includes("=") && !l.trim().startsWith("#"))
		.map((l) => {
			const i = l.indexOf("=");
			return [
				l.slice(0, i).trim(),
				l
					.slice(i + 1)
					.trim()
					.replace(/^["']|["']$/g, ""),
			];
		}),
) as Record<string, string>;

const sb = createClient(
	env.NEXT_PUBLIC_SUPABASE_URL,
	env.SUPABASE_SERVICE_ROLE_KEY,
	{ auth: { persistSession: false } },
);

const n = (v: unknown) => Number(v ?? 0);
const rp = (v: unknown) => `Rp${Math.round(n(v)).toLocaleString("id-ID")}`;
let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
	console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
	ok ? pass++ : fail++;
	return ok;
};

async function saldo(code: string): Promise<number> {
	let bal = 0;
	for (let from = 0; ; from += 1000) {
		const { data } = await sb
			.from("journal_lines")
			.select("debit_amount, credit_amount")
			.eq("account_code", code)
			.range(from, from + 999);
		const rows = data ?? [];
		for (const l of rows) bal += n(l.debit_amount) - n(l.credit_amount);
		if (rows.length < 1000) break;
	}
	return bal;
}
const WATCH = ["1-100", "1-110", "2-100", "2-300"];
async function snapshotSaldo() {
	const out: Record<string, number> = {};
	for (const c of WATCH) out[c] = await saldo(c);
	return out;
}
const fmtSaldo = (s: Record<string, number>) =>
	WATCH.map((c) => `${c}=${rp(s[c])}`).join("  ");

// ── Bahan uji ───────────────────────────────────────────────────────────
let eventId: string | null = null;
let rekapId: string | null = null;
let settlementId: string | null = null;
const before = await snapshotSaldo();
console.log(`saldo awal: ${fmtSaldo(before)}\n`);

try {
	// ── 1. Event + crew ─────────────────────────────────────────────────
	console.log("1. Siapkan event uji + 2 crew");
	const { data: owner } = await sb
		.from("users")
		.select("id, auth_user_id:id, full_name, role")
		.eq("role", "super_admin")
		.limit(1)
		.maybeSingle();
	const { data: crew } = await sb
		.from("users")
		.select("id, full_name, role")
		.eq("role", "crew")
		.eq("is_active", true)
		.limit(2);
	if (!owner || (crew ?? []).length < 2) {
		throw new Error("butuh 1 super_admin + 2 crew aktif untuk uji ini");
	}

	const today = new Date().toISOString().slice(0, 10);
	const { data: ev, error: evErr } = await sb
		.from("events")
		.insert({
			project_id: `PRJ-ZZTEST-${Math.floor(Math.random() * 99999)}`,
			client_name: TAG,
			client_wa: "0000000000",
			venue_name: "ZZ TEST VENUE",
			venue_address: "-",
			start_time: "10:00",
			end_time: "14:00",
			event_date: today,
			status: "upcoming",
			channel: "direct",
			event_category: "corporate",
			frame_size: "2R",
			service_type: "photobooth_classic",
			base_price: 3_000_000,
			grand_total: 3_000_000,
			total_paid: 3_000_000,
			remaining_balance: 0,
			payment_status: "paid",
			created_by: owner.id,
		})
		.select("id, project_id")
		.single();
	if (evErr) throw new Error(`gagal buat event: ${evErr.message}`);
	eventId = ev.id as string;
	check("event uji dibuat", true, ev.project_id as string);

	const { error: caErr } = await sb.from("crew_assignments").insert([
		{
			event_id: eventId,
			user_id: crew?.[0].id,
			role_in_event: "lead",
			fee_amount: 200_000,
			bonus_amount: 0,
			reimbursement_amount: 0,
			assigned_by: owner.id,
		},
		{
			event_id: eventId,
			user_id: crew?.[1].id,
			role_in_event: "asisten",
			fee_amount: 150_000,
			bonus_amount: 0,
			reimbursement_amount: 0,
			assigned_by: owner.id,
		},
	]);
	if (caErr) throw new Error(`gagal assign crew: ${caErr.message}`);
	check("2 crew di-assign", true, "lead Rp200.000 + asisten Rp150.000");

	// ── 2. Crew mengisi rekap ───────────────────────────────────────────
	console.log("\n2. Crew mengisi rekap (bahan + biaya lapangan)");
	const { data: rk, error: rkErr } = await sb
		.from("crew_rekap")
		.insert({
			event_id: eventId,
			submitted_by: crew?.[0].id,
			status: "submitted",
			cetak_total: 0,
			media_set_used: 0,
			sleeve_used: 0,
			flashdisk_used: 0,
			pouch_used: 0,
			photomagnet_used: 0,
			keychain_used: 0,
			transport_method: "rental",
			transport_cost: 0,
			bensin_cost: 120_000,
			toll_cost: 35_000,
			parking_cost: 15_000,
			konsumsi_cost: 80_000,
			// konsumsi dibayar owner → TIDAK boleh jadi utang ke crew
			expense_paid_by: { konsumsi: "owner" },
			lainnya_items: [{ label: "Kabel roll", amount: 25_000, paid_by: "crew" }],
			crew_notes: `${TAG} — data uji otomatis`,
			proof_photo_urls: [],
			custom_materials: {},
		})
		.select("id")
		.single();
	if (rkErr) throw new Error(`gagal buat rekap: ${rkErr.message}`);
	rekapId = rk.id as string;

	const { data: rekapRow } = await sb
		.from("crew_rekap")
		.select(
			"transport_cost, bensin_cost, toll_cost, parking_cost, konsumsi_cost, lainnya_items, expense_paid_by, submitted_by",
		)
		.eq("id", rekapId)
		.single();
	const talangan = crewFrontedExpenses(rekapRow as never);
	check(
		"talangan crew dihitung tanpa biaya yang dibayar owner",
		talangan === 120_000 + 35_000 + 15_000 + 25_000,
		`${rp(talangan)} (konsumsi ${rp(80_000)} milik owner dikecualikan)`,
	);

	// ── 3. Samakan talangan (jalur yang dipakai settleEvent) ────────────
	console.log("\n3. Samakan talangan crew sebelum settle");
	const sync = await syncCrewReimbursement(sb as never, eventId);
	check(
		"reimbursement crew disesuaikan otomatis",
		!!sync && sync.after === talangan && !sync.blocked,
		sync ? `${rp(sync.before)} → ${rp(sync.after)}` : "tidak jalan",
	);

	// ── 4. Owner settle ─────────────────────────────────────────────────
	console.log("\n4. Owner settle event");
	const { error: apprErr } = await sb
		.from("crew_rekap")
		.update({
			is_approved: true,
			status: "reviewed",
			reviewed_by: owner.id,
			reviewed_at: new Date().toISOString(),
		})
		.eq("id", rekapId);
	if (apprErr) throw new Error(`gagal approve rekap: ${apprErr.message}`);

	// Di produksi status ini dinaikkan cron status-transition setelah event
	// selesai; di sini dimajukan manual supaya settle_event mau jalan.
	const { error: stErr } = await sb
		.from("events")
		.update({ status: "awaiting_settlement" })
		.eq("id", eventId);
	if (stErr) throw new Error(`gagal ubah status event: ${stErr.message}`);

	// Commit stok — di aplikasi dipanggil saat owner approve rekap. Pemakaian
	// bahan di event uji ini nol, jadi tidak ada gerakan stok; yang penting
	// penanda stock_committed_at terisi supaya gerbang settle_event lolos.
	const { error: commitErr } = await sb.rpc("commit_rekap_stock", {
		p_rekap_id: rekapId,
		p_event_id: eventId,
		p_actor: owner.id,
		p_movements: [],
		p_hpp_snapshot: {
			mediaset: 0,
			sleeve: 0,
			flashdisk: 0,
			pouch: 0,
			photomagnet: 0,
			keychain: 0,
			bonus: 0,
			other: 0,
			total: 0,
		},
		p_hpp_total: 0,
		p_batch_id: null,
		p_is_approved: true,
		p_status: "reviewed",
		p_review_notes: null,
	});
	if (commitErr)
		throw new Error(`commit_rekap_stock gagal: ${commitErr.message}`);

	const { data: authRow } = await sb
		.from("users")
		.select("id")
		.eq("id", owner.id)
		.single();
	const { data: settleRes, error: settleErr } = await sb.rpc("settle_event", {
		p_event_id: eventId,
		p_owner_user_id: authRow?.id,
		p_overrides: null,
	});
	if (settleErr) throw new Error(`settle_event gagal: ${settleErr.message}`);
	const result = (
		Array.isArray(settleRes) ? settleRes[0] : settleRes
	) as Record<string, unknown>;
	settlementId = String(result.settlement_id ?? "");
	check("settle_event jalan", !!settlementId, `laba ${rp(result.net_profit)}`);

	// ── 5. Periksa hasilnya ─────────────────────────────────────────────
	console.log("\n5. Periksa hasil di pembukuan");
	const { data: st } = await sb
		.from("event_settlements")
		.select("*")
		.eq("id", settlementId)
		.single();

	const { data: je } = await sb
		.from("journal_entries")
		.select("id, ref_id, total_amount")
		.eq("source_type", "settlement")
		.eq("source_event_id", eventId);
	const entryIds = (je ?? []).map((e) => e.id as string);
	const { data: jl } = await sb
		.from("journal_lines")
		.select("account_code, debit_amount, credit_amount, description")
		.in("entry_id", entryIds);

	const totD = (jl ?? []).reduce((s, l) => s + n(l.debit_amount), 0);
	const totK = (jl ?? []).reduce((s, l) => s + n(l.credit_amount), 0);
	check(
		"jurnal settlement balance",
		Math.abs(totD - totK) <= 1,
		`D ${rp(totD)} vs K ${rp(totK)}`,
	);

	const kredit2100 = (jl ?? [])
		.filter((l) => l.account_code === "2-100")
		.reduce((s, l) => s + n(l.credit_amount), 0);
	const { data: asg } = await sb
		.from("crew_assignments")
		.select("fee_amount, bonus_amount, reimbursement_amount")
		.eq("event_id", eventId);
	const payable = (asg ?? []).reduce(
		(s, a) =>
			s + n(a.fee_amount) + n(a.bonus_amount) + n(a.reimbursement_amount),
		0,
	);
	check(
		"utang ke crew = yang bisa dibayar aplikasi",
		Math.abs(kredit2100 - payable) <= 1,
		`jurnal ${rp(kredit2100)} vs bisa dibayar ${rp(payable)}`,
	);
	check(
		"konsumsi yang dibayar owner tidak jadi utang crew",
		kredit2100 === 350_000 + talangan,
		`${rp(kredit2100)} = fee ${rp(350_000)} + talangan ${rp(talangan)}`,
	);

	check(
		"laba = pendapatan − HPP − OpEx",
		Math.abs(
			n(st?.revenue_net) -
				n(st?.hpp_total) -
				n(st?.opex_total) -
				n(st?.net_profit),
		) <= 2,
		`${rp(st?.revenue_net)} − ${rp(st?.hpp_total)} − ${rp(st?.opex_total)} = ${rp(st?.net_profit)}`,
	);

	const { data: earn } = await sb
		.from("owner_earnings")
		.select("amount")
		.eq("source_settlement_id", settlementId);
	const earnTotal = (earn ?? []).reduce((s, e) => s + n(e.amount), 0);
	check(
		"bagi hasil owner tercatat sesuai pool",
		Math.abs(earnTotal - n(st?.owner_pool_total)) <= 1,
		`${rp(earnTotal)} vs pool ${rp(st?.owner_pool_total)}`,
	);

	const { data: rkAfter } = await sb
		.from("crew_rekap")
		.select("status, settled_at, locked, stock_committed_at")
		.eq("id", rekapId)
		.single();
	check(
		"rekap terkunci setelah settle",
		!!rkAfter?.settled_at && !!rkAfter?.locked,
		`status=${rkAfter?.status}`,
	);

	const { data: evAfter } = await sb
		.from("events")
		.select("status")
		.eq("id", eventId)
		.single();
	check(
		"event jadi selesai",
		evAfter?.status === "completed",
		String(evAfter?.status),
	);
} catch (e) {
	console.error(`\nGAGAL: ${e instanceof Error ? e.message : String(e)}`);
	fail++;
} finally {
	// ── 6. Bersih-bersih ────────────────────────────────────────────────
	if (KEEP) {
		console.log(
			"\n(--keep) data uji dibiarkan; hapus manual kalau sudah selesai",
		);
	} else {
		console.log("\n6. Bersih-bersih");
		if (eventId) {
			// Urutan menghormati foreign key, dari daun ke akar:
			//   sinking_fund_movements & owner_earnings → event_settlements
			//   → journal_lines → journal_entries → events
			// Sekali terbalik, jurnalnya tertinggal sebagai yatim tanpa baris
			// dan event-nya tidak bisa dihapus sama sekali.
			let clean = true;
			const step = async (
				label: string,
				// biome-ignore lint/suspicious/noExplicitAny: rantai builder PostgREST
				run: any,
			) => {
				const { error } = await run;
				if (error) {
					clean = false;
					console.log(`  ${label}: ${error.message}`);
				}
			};

			if (settlementId) {
				await step(
					"sinking_fund_movements",
					sb
						.from("sinking_fund_movements")
						.delete()
						.eq("source_settlement_id", settlementId),
				);
				await step(
					"owner_earnings",
					sb
						.from("owner_earnings")
						.delete()
						.eq("source_settlement_id", settlementId),
				);
			}
			await step(
				"owner_earnings (event)",
				sb.from("owner_earnings").delete().eq("source_event_id", eventId),
			);
			await step(
				"sinking_fund_movements (event)",
				sb
					.from("sinking_fund_movements")
					.delete()
					.eq("source_event_id", eventId),
			);
			await step(
				"event_settlements",
				sb.from("event_settlements").delete().eq("event_id", eventId),
			);

			const { data: je } = await sb
				.from("journal_entries")
				.select("id")
				.eq("source_event_id", eventId);
			const ids = (je ?? []).map((x) => x.id as string);
			if (ids.length) {
				await step(
					"journal_lines",
					sb.from("journal_lines").delete().in("entry_id", ids),
				);
				await step(
					"journal_entries",
					sb.from("journal_entries").delete().in("id", ids),
				);
			}

			await step(
				"stock_movements",
				sb.from("stock_movements").delete().eq("source_id", eventId),
			);
			await step(
				"crew_rekap",
				sb.from("crew_rekap").delete().eq("event_id", eventId),
			);
			await step(
				"crew_assignments",
				sb.from("crew_assignments").delete().eq("event_id", eventId),
			);
			await step(
				"notifications",
				sb.from("notifications").delete().eq("entity_id", eventId),
			);
			await step("events", sb.from("events").delete().eq("id", eventId));
			if (clean) console.log("  seluruh baris uji dihapus");
		}

		const after = await snapshotSaldo();
		console.log(`  saldo akhir: ${fmtSaldo(after)}`);
		const same = WATCH.every((c) => Math.abs(after[c] - before[c]) <= 1);
		check(
			"saldo kas/bank & utang kembali seperti semula",
			same,
			same
				? ""
				: WATCH.map((c) => `${c}: ${rp(before[c])} → ${rp(after[c])}`).join(
						" · ",
					),
		);

		const { data: sisa } = await sb
			.from("events")
			.select("id")
			.eq("client_name", TAG);
		check("tidak ada event uji tersisa", (sisa ?? []).length === 0);
	}
}

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail > 0 ? 1 : 0);
