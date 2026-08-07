/**
 * QA — cari uang keluar yang TIDAK mengurangi saldo kas/bank.
 *
 * BACA SAJA.
 *
 * Dua jenis kebocoran yang dicari:
 *
 *   A. Catatan operasional bilang "sudah dibayar", tapi tidak ada jurnal yang
 *      mengkredit rekening kas/bank. Uangnya keluar di dunia nyata, saldo di
 *      buku tidak bergerak.
 *
 *   B. Biaya yang memang sengaja TIDAK menyentuh kas saat dicatat (jadi utang
 *      atau ditanggung owner). Ini sah, tapi harus ada pasangannya nanti —
 *      kalau utangnya tidak pernah dilunasi atau owner tidak pernah mencatat
 *      pengeluarannya, saldo bank ikut salah.
 *
 * Pakai: npx tsx scripts/qa-cash-leak-audit.mts [--verbose]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const VERBOSE = process.argv.includes("--verbose");

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
const isCash = (code: string) => /^1-1\d\d$/.test(code);

type Level = "OK" | "WARN" | "BOCOR";
const tally: Record<Level, number> = { OK: 0, WARN: 0, BOCOR: 0 };
const summary: string[] = [];
function report(level: Level, code: string, msg: string, rows: string[] = []) {
	tally[level]++;
	if (level !== "OK") summary.push(`[${code}] ${msg}`);
	const icon = level === "OK" ? "✓" : level === "WARN" ? "!" : "✗";
	console.log(`  ${icon} [${code}] ${msg}`);
	for (const r of rows.slice(0, VERBOSE ? 200 : 8)) console.log(`        ${r}`);
	if (!VERBOSE && rows.length > 8)
		console.log(`        … +${rows.length - 8} lagi`);
}

async function all<T>(table: string, columns: string): Promise<T[]> {
	const out: T[] = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await sb
			.from(table)
			.select(columns)
			.range(from, from + 999);
		if (error) throw new Error(`${table}: ${error.message}`);
		const rows = (data ?? []) as unknown as T[];
		out.push(...rows);
		if (rows.length < 1000) break;
	}
	return out;
}

type JE = {
	id: string;
	ref_id: string;
	source_type: string | null;
	source_id: string | null;
	source_event_id: string | null;
	entry_date: string;
	description: string | null;
	is_reversed: boolean | null;
};
type JL = {
	entry_id: string;
	account_code: string;
	debit_amount: number | string;
	credit_amount: number | string;
};

const [entries, lines] = await Promise.all([
	all<JE>(
		"journal_entries",
		"id, ref_id, source_type, source_id, source_event_id, entry_date, description, is_reversed, reversed_by_entry_id",
	),
	all<JL>(
		"journal_lines",
		"entry_id, account_code, debit_amount, credit_amount",
	),
]);
const live = entries.filter((e) => !e.is_reversed);
const linesByEntry = new Map<string, JL[]>();
for (const l of lines) {
	const arr = linesByEntry.get(l.entry_id);
	arr ? arr.push(l) : linesByEntry.set(l.entry_id, [l]);
}
/**
 * Saldo satu akun dari SELURUH baris jurnal.
 *
 * Jangan menyaring is_reversed di sini: pembatalan di aplikasi ini dilakukan
 * dengan membuat jurnal PEMBALIK, bukan menyembunyikan yang asli. Membuang
 * yang asli sementara pembaliknya tetap terhitung justru menggeser saldo —
 * persis kesalahan yang membuat audit ini sempat melaporkan saldo BCA
 * Rp150.000 lebih tinggi dari yang sebenarnya.
 */
const saldoAkun = (code: string) =>
	lines
		.filter((l) => l.account_code === code)
		.reduce((s, l) => s + n(l.debit_amount) - n(l.credit_amount), 0);

/** Uang kas/bank yang keluar pada satu jurnal. */
const cashOut = (entryId: string) =>
	(linesByEntry.get(entryId) ?? [])
		.filter((l) => isCash(l.account_code))
		.reduce((s, l) => s + n(l.credit_amount) - n(l.debit_amount), 0);

console.log("AUDIT KEBOCORAN KAS — uang keluar yang tidak mengurangi saldo\n");

// ════════════════════════════════════════════════════════════════════════
console.log("A. Catatan 'sudah dibayar' vs jurnalnya");

// A1 — fee crew lunas wajib punya jurnal yang mengkredit kas/bank
{
	const assigns = await all<{
		id: string;
		event_id: string;
		fee_amount: number | null;
		bonus_amount: number | null;
		reimbursement_amount: number | null;
		is_paid: boolean | null;
		paid_at: string | null;
		paid_via_account: string | null;
	}>(
		"crew_assignments",
		"id, event_id, fee_amount, bonus_amount, reimbursement_amount, is_paid, paid_at, paid_via_account",
	);
	const paid = assigns.filter(
		(a) => a.is_paid && a.paid_via_account && n(a.paid_at) !== 0,
	);
	const payEntries = live.filter((e) => e.source_type === "crew_payment");
	const paidWithJournal = new Set(
		payEntries.map((e) => e.source_id).filter(Boolean) as string[],
	);
	const bad = paid.filter((a) => !paidWithJournal.has(a.id));
	const totalKas = payEntries.reduce((s, e) => s + cashOut(e.id), 0);
	const totalPaid = paid
		.filter((a) => paidWithJournal.has(a.id))
		.reduce(
			(s, a) =>
				s + n(a.fee_amount) + n(a.bonus_amount) + n(a.reimbursement_amount),
			0,
		);
	bad.length
		? report(
				"BOCOR",
				"A1",
				`${bad.length} fee crew ditandai lunas tanpa jurnal pembayaran — kas tidak pernah berkurang`,
				bad.map((a) => `assignment ${a.id} · ${a.paid_at?.slice(0, 10)}`),
			)
		: report(
				"OK",
				"A1",
				`${paid.length} fee crew lunas, semuanya berjurnal · kas keluar lewat jurnal pembayaran ${rp(totalKas)}` +
					(Math.abs(totalPaid - totalKas) > 1
						? ` (sisa ${rp(totalPaid - totalKas)} dilunasi lewat jurnal koreksi)`
						: ""),
			);
}

// A2 — pelunasan hutang vendor
{
	const payables = await all<{
		id: string;
		amount: number | string;
		amount_paid: number | string;
		status: string;
		description: string | null;
	}>("payables", "id, amount, amount_paid, status, description");
	const partiallyPaid = payables.filter((p) => n(p.amount_paid) > 0);
	const payments = await all<{
		id: string;
		payable_id: string;
		amount: number | string;
		payment_date: string;
	}>("payable_payments", "id, payable_id, amount, payment_date");
	const totalPaidRows = payments.reduce((s, p) => s + n(p.amount), 0);
	const payEntries = live.filter((e) =>
		["payable_payment", "payables", "payment_payable"].includes(
			e.source_type ?? "",
		),
	);
	const totalKas = payEntries.reduce((s, e) => s + cashOut(e.id), 0);
	if (payments.length === 0) {
		report(
			"OK",
			"A2",
			`tidak ada pembayaran hutang vendor (${partiallyPaid.length} payable tercatat)`,
		);
	} else if (Math.abs(totalPaidRows - totalKas) > 1) {
		report(
			"BOCOR",
			"A2",
			`pembayaran hutang vendor ${rp(totalPaidRows)} tapi kas keluar cuma ${rp(totalKas)} — selisih ${rp(totalPaidRows - totalKas)}`,
		);
	} else {
		report(
			"OK",
			"A2",
			`pembayaran hutang vendor ${rp(totalPaidRows)} = kas keluar`,
		);
	}
}

// A3 — pengambilan bagi hasil owner
{
	const earnings = await all<{
		id: string;
		earning_type: string;
		amount: number | string;
		withdrawal_method: string | null;
		created_at: string;
	}>(
		"owner_earnings",
		"id, earning_type, amount, withdrawal_method, created_at",
	);
	const withdrawals = earnings.filter((e) => e.earning_type === "withdrawal");
	const totalTarik = withdrawals.reduce((s, w) => s + Math.abs(n(w.amount)), 0);
	const wEntries = live.filter((e) => e.source_type === "owner_withdrawal");
	const totalKas = wEntries.reduce((s, e) => s + cashOut(e.id), 0);
	withdrawals.length === 0
		? report("OK", "A3", "belum ada pengambilan bagi hasil owner")
		: Math.abs(totalTarik - totalKas) > 1
			? report(
					"BOCOR",
					"A3",
					`pengambilan bagi hasil ${rp(totalTarik)} tapi kas keluar ${rp(totalKas)} — selisih ${rp(totalTarik - totalKas)}`,
				)
			: report(
					"OK",
					"A3",
					`${withdrawals.length} pengambilan bagi hasil ${rp(totalTarik)} = kas keluar`,
				);
}

// A4 — komisi vendor/relasi/sales yang sudah dibayar
{
	const komisiEntries = live.filter(
		(e) => e.source_type === "commission_payment",
	);
	const totalKas = komisiEntries.reduce((s, e) => s + cashOut(e.id), 0);
	const tanpaKas = komisiEntries.filter((e) => cashOut(e.id) <= 0);
	tanpaKas.length
		? report(
				"BOCOR",
				"A4",
				`${tanpaKas.length} pembayaran komisi tidak mengkredit kas/bank`,
				tanpaKas.map((e) => `${e.ref_id} — ${e.description}`),
			)
		: report(
				"OK",
				"A4",
				`${komisiEntries.length} pembayaran komisi, kas keluar ${rp(totalKas)}`,
			);
}

// ════════════════════════════════════════════════════════════════════════
console.log("\nB. Biaya yang sengaja tidak menyentuh kas — ada pasangannya?");

// B1 — biaya event yang ditandai "dibayar owner": wajib dicatat manual
{
	const rekaps = await all<{
		event_id: string;
		transport_cost: number | string | null;
		bensin_cost: number | string | null;
		toll_cost: number | string | null;
		parking_cost: number | string | null;
		konsumsi_cost: number | string | null;
		lainnya_items: unknown;
		expense_paid_by: unknown;
	}>(
		"crew_rekap",
		"event_id, transport_cost, bensin_cost, toll_cost, parking_cost, konsumsi_cost, lainnya_items, expense_paid_by",
	);
	const events = await all<{
		id: string;
		project_id: string;
		client_name: string;
		finance_frozen_at: string | null;
		is_migrated_legacy: boolean | null;
	}>(
		"events",
		"id, project_id, client_name, finance_frozen_at, is_migrated_legacy",
	);
	const evById = new Map(events.map((e) => [e.id, e]));
	const manualByEvent = new Set(
		live
			.filter((e) => e.source_type === "manual" && e.source_event_id)
			.map((e) => e.source_event_id as string),
	);

	const rows: string[] = [];
	let total = 0;
	for (const r of rekaps) {
		const ev = evById.get(r.event_id);
		if (!ev || ev.finance_frozen_at || ev.is_migrated_legacy) continue;
		const pb = (
			r.expense_paid_by && typeof r.expense_paid_by === "object"
				? r.expense_paid_by
				: {}
		) as Record<string, unknown>;
		let ownerPaid = 0;
		for (const [key, value] of [
			["transport", r.transport_cost],
			["bensin", r.bensin_cost],
			["toll", r.toll_cost],
			["parking", r.parking_cost],
			["konsumsi", r.konsumsi_cost],
		] as const) {
			if (String(pb[key] ?? "crew") === "owner") ownerPaid += n(value);
		}
		if (Array.isArray(r.lainnya_items)) {
			for (const raw of r.lainnya_items) {
				const item = (raw ?? {}) as Record<string, unknown>;
				if (String(item.paid_by ?? "crew") === "owner")
					ownerPaid += n(item.amount);
			}
		}
		if (ownerPaid <= 0) continue;
		if (manualByEvent.has(r.event_id)) continue;
		total += ownerPaid;
		rows.push(`${ev.project_id} ${ev.client_name} — ${rp(ownerPaid)}`);
	}
	rows.length
		? report(
				"BOCOR",
				"B1",
				`${rows.length} event punya biaya bertanda "dibayar owner" ${rp(total)} tapi tidak ada catatan transaksi yang menautkannya — uangnya keluar tanpa mengurangi saldo`,
				rows,
			)
		: report(
				"OK",
				"B1",
				'biaya bertanda "dibayar owner" semuanya punya catatan transaksi',
			);
}

// B2 — utang yang belum lunas: sah, tapi ditampilkan supaya tidak terlupa
{
	const saldo = (code: string) => -saldoAkun(code); // kewajiban: credit-normal
	const utang = [
		["2-100", "Hutang Fee Crew"],
		["2-101", "Hutang Vendor"],
		["2-102", "Hutang Komisi Relasi"],
		["2-103", "Hutang Komisi Vendor"],
		["2-300", "Bagi Hasil Owner"],
	] as const;
	const rows: string[] = [];
	let total = 0;
	for (const [code, name] of utang) {
		const s = saldo(code);
		if (Math.abs(s) > 1) {
			rows.push(`${code} ${name} — ${rp(s)}`);
			total += s;
		}
	}
	rows.length
		? report(
				"WARN",
				"B2",
				`${rp(total)} sudah jadi beban tapi kasnya belum keluar (akan mengurangi saldo saat dibayar)`,
				rows,
			)
		: report("OK", "B2", "tidak ada utang yang menunggu pembayaran");
}

// B3 — jurnal berbeban yang tidak mengkredit kas maupun utang
{
	const NON_KAS_SAH = /^(1-2|1-4|2-|3-|4-)/; // persediaan, aset, utang, modal, pendapatan
	const bad: string[] = [];
	for (const e of live) {
		const ls = linesByEntry.get(e.id) ?? [];
		const beban = ls.filter(
			(l) => l.account_code.startsWith("5-") && n(l.debit_amount) > 0,
		);
		if (beban.length === 0) continue;
		const credits = ls.filter((l) => n(l.credit_amount) > 0);
		if (credits.some((l) => isCash(l.account_code))) continue;
		if (credits.every((l) => NON_KAS_SAH.test(l.account_code))) continue;
		bad.push(
			`${e.ref_id} (${e.source_type}) — kredit ke ${[...new Set(credits.map((l) => l.account_code))].join(", ")}`,
		);
	}
	bad.length
		? report(
				"BOCOR",
				"B3",
				`${bad.length} jurnal berbeban tidak mengkredit kas maupun akun yang wajar`,
				bad,
			)
		: report(
				"OK",
				"B3",
				"tiap jurnal berbeban mengkredit kas, persediaan, utang, atau modal",
			);
}

// B4 — pembelian tunai wajib mengkredit kas
{
	const beli = live.filter((e) => e.source_type === "purchase");
	const tanpaKas = beli.filter((e) => {
		const ls = linesByEntry.get(e.id) ?? [];
		const kredit = ls.filter((l) => n(l.credit_amount) > 0);
		// tempo → kredit 2-101 Hutang Vendor, itu sah
		if (kredit.some((l) => l.account_code === "2-101")) return false;
		return !kredit.some((l) => isCash(l.account_code));
	});
	tanpaKas.length
		? report(
				"BOCOR",
				"B4",
				`${tanpaKas.length} pembelian tidak mengkredit kas maupun hutang vendor`,
				tanpaKas.map((e) => `${e.ref_id} — ${e.description}`),
			)
		: report(
				"OK",
				"B4",
				`${beli.length} jurnal pembelian: tunai mengurangi kas, tempo jadi hutang vendor`,
			);
}

// ════════════════════════════════════════════════════════════════════════
console.log("\nC. Rekening kas/bank");

// C1 — tidak boleh ada rekening bersaldo minus
{
	const saldoByCode = new Map<string, number>();
	for (const code of new Set(
		lines.map((l) => l.account_code).filter((c) => isCash(c)),
	)) {
		saldoByCode.set(code, saldoAkun(code));
	}
	const minus = [...saldoByCode.entries()].filter(([, v]) => v < -1);
	const rows = [...saldoByCode.entries()]
		.sort()
		.map(([c, v]) => `${c} ${rp(v)}`);
	minus.length
		? report(
				"BOCOR",
				"C1",
				`${minus.length} rekening bersaldo minus`,
				minus.map(([c, v]) => `${c} ${rp(v)}`),
			)
		: report("OK", "C1", `saldo rekening: ${rows.join(" · ")}`);
}

// C2 — jurnal yang ditandai dibatalkan wajib punya jurnal pembalik
{
	const reversed = entries.filter((e) => e.is_reversed);
	const ids = new Set(entries.map((e) => e.id));
	const tanpaPembalik = reversed.filter(
		(e) => !(e as JE & { reversed_by_entry_id?: string }).reversed_by_entry_id,
	);
	const pembalikHilang = reversed.filter((e) => {
		const by = (e as JE & { reversed_by_entry_id?: string })
			.reversed_by_entry_id;
		return by && !ids.has(by);
	});
	tanpaPembalik.length || pembalikHilang.length
		? report(
				"BOCOR",
				"C2",
				`${tanpaPembalik.length + pembalikHilang.length} jurnal ditandai dibatalkan tanpa jurnal pembalik — saldo akun ikut salah`,
				[...tanpaPembalik, ...pembalikHilang].map(
					(e) => `${e.ref_id} — ${e.description}`,
				),
			)
		: report(
				"OK",
				"C2",
				`${reversed.length} jurnal dibatalkan, semuanya punya jurnal pembalik`,
			);
}

// ════════════════════════════════════════════════════════════════════════
console.log("\nD. Uang keluar per modul");
{
	const perModul = new Map<
		string,
		{ n: number; keluar: number; masuk: number }
	>();
	for (const e of entries) {
		const arus = cashOut(e.id);
		const key = e.source_type ?? "(tanpa sumber)";
		const cur = perModul.get(key) ?? { n: 0, keluar: 0, masuk: 0 };
		cur.n++;
		if (arus > 0) cur.keluar += arus;
		if (arus < 0) cur.masuk += -arus;
		perModul.set(key, cur);
	}
	const rows = [...perModul.entries()].sort(
		(a, b) => b[1].keluar - a[1].keluar,
	);
	for (const [modul, v] of rows) {
		const arus =
			v.keluar === 0 && v.masuk === 0
				? "tidak menyentuh kas"
				: `keluar ${rp(v.keluar)}${v.masuk > 0 ? ` · masuk ${rp(v.masuk)}` : ""}`;
		console.log(
			`  ${modul.padEnd(22)} ${String(v.n).padStart(3)} jurnal · ${arus}`,
		);
	}
	const totalKeluar = rows.reduce((s, [, v]) => s + v.keluar, 0);
	const totalMasuk = rows.reduce((s, [, v]) => s + v.masuk, 0);
	console.log(
		`  ${"TOTAL".padEnd(22)} ${String(entries.length).padStart(3)} jurnal · keluar ${rp(totalKeluar)} · masuk ${rp(totalMasuk)} · saldo ${rp(totalMasuk - totalKeluar)}`,
	);
}

console.log(`\n${"═".repeat(72)}`);
console.log(
	`RINGKASAN: ${tally.OK} aman · ${tally.WARN} perlu dilihat · ${tally.BOCOR} bocor`,
);
for (const s of summary) console.log(`  ${s}`);
process.exit(tally.BOCOR > 0 ? 1 : 0);
