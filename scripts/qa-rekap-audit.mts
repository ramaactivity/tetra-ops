/**
 * QA — audit rantai REKAP: crew isi → owner review → settle → pembukuan.
 *
 * BACA SAJA. Tidak menulis apa pun ke database.
 *
 * Rantai yang diperiksa:
 *   crew_rekap ─┬─ stock_movements (commit stok + HPP)
 *               ├─ crew_assignments (fee, bonus, reimbursement, pembayaran)
 *               └─ event_settlements ─┬─ journal_entries + journal_lines
 *                                     ├─ owner_earnings (bagi hasil)
 *                                     └─ events.status
 *
 * Tiap pemeriksaan menghasilkan salah satu:
 *   OK    — invarian terpenuhi
 *   WARN  — mencurigakan, mungkin wajar (mis. data legacy)
 *   BUG   — tidak konsisten; ada yang salah di kode atau data
 *
 * Pakai: npx tsx scripts/qa-rekap-audit.mts [--verbose]
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

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

type Level = "OK" | "WARN" | "BUG";
const tally: Record<Level, number> = { OK: 0, WARN: 0, BUG: 0 };
const findings: Array<{
	level: Level;
	code: string;
	msg: string;
	rows: string[];
}> = [];

function report(level: Level, code: string, msg: string, rows: string[] = []) {
	tally[level]++;
	findings.push({ level, code, msg, rows });
	const icon = level === "OK" ? "✓" : level === "WARN" ? "!" : "✗";
	console.log(`  ${icon} [${code}] ${msg}`);
	for (const r of rows.slice(0, VERBOSE ? 100 : 8)) console.log(`        ${r}`);
	if (!VERBOSE && rows.length > 8)
		console.log(`        … +${rows.length - 8} lagi`);
}

/** Ambil seluruh baris tabel dengan paginasi (PostgREST memotong di 1000). */
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

// ── Muat data ───────────────────────────────────────────────────────────
type Ev = {
	id: string;
	project_id: string;
	status: string;
	client_name: string;
	event_date: string;
	grand_total: number | string;
	discount_amount: number | string | null;
	is_migrated_legacy: boolean | null;
	deleted_at: string | null;
	finance_frozen_at: string | null;
};
type Rekap = {
	id: string;
	event_id: string;
	submitted_by: string | null;
	status: string;
	is_approved: boolean | null;
	reviewed_by: string | null;
	reviewed_at: string | null;
	stock_committed_at: string | null;
	stock_movement_batch_id: string | null;
	settled_at: string | null;
	locked: boolean | null;
	cetak_total: number | null;
	media_set_used: number | null;
	sleeve_used: number | null;
	flashdisk_used: number | null;
	pouch_used: number | null;
	photomagnet_used: number | null;
	keychain_used: number | null;
	hpp_snapshot: unknown;
	hpp_snapshot_total: number | string | null;
	transport_cost: number | string | null;
	bensin_cost: number | string | null;
	toll_cost: number | string | null;
	parking_cost: number | string | null;
	konsumsi_cost: number | string | null;
	lainnya_items: unknown;
	expense_paid_by: unknown;
	proof_photo_urls: unknown;
	created_at: string;
};
type Assign = {
	id: string;
	event_id: string;
	user_id: string;
	role_in_event: string;
	fee_amount: number | string | null;
	bonus_amount: number | string | null;
	reimbursement_amount: number | string | null;
	total_fee: number | string | null;
	is_paid: boolean | null;
	paid_at: string | null;
	paid_via_account: string | null;
};
type Settle = {
	id: string;
	event_id: string;
	revenue_net: number | string;
	hpp_mediaset: number | string;
	hpp_sleeve: number | string;
	hpp_flashdisk: number | string;
	hpp_pouch: number | string;
	hpp_photomagnet: number | string;
	hpp_keychain: number | string;
	hpp_other: number | string;
	hpp_bonus: number | string | null;
	hpp_total: number | string;
	opex_total: number | string;
	total_biaya: number | string;
	net_profit: number | string;
	margin_percentage: number | string;
	sinking_equipment: number | string;
	sinking_maintenance: number | string;
	sinking_crew_reserve: number | string;
	sinking_emergency: number | string;
	sinking_total: number | string;
	owner_pool_total: number | string;
	owner_pool_per_person: number | string;
	journal_entry_id: string | null;
	is_reopened: boolean | null;
	closed_at: string | null;
	fee_lead: number | string;
	fee_asisten: number | string;
	fee_crew_c: number | string;
	fee_extra: number | string;
	transport_bbm: number | string;
	sewa_alat: number | string;
	perawatan: number | string;
	konsumsi: number | string;
	komisi_vendor: number | string;
	komisi_relasi: number | string;
	komisi_sales_direct: number | string;
	platform_fee: number | string;
	diskon_tambahan: number | string;
};
type JE = {
	id: string;
	ref_id: string;
	source_type: string | null;
	source_id: string | null;
	source_event_id: string | null;
	total_amount: number | string;
	is_reversed: boolean | null;
	entry_date: string;
};
type JL = {
	entry_id: string;
	account_code: string;
	debit_amount: number | string;
	credit_amount: number | string;
};
type Earn = {
	id: string;
	owner_user_id: string;
	earning_type: string;
	amount: number | string;
	source_event_id: string | null;
	source_settlement_id: string | null;
};
type Mov = {
	id: string;
	item_id: string;
	direction: string;
	quantity: number | string;
	source: string;
	source_id: string | null;
};

const [
	events,
	rekaps,
	assigns,
	settlements,
	entries,
	lines,
	earnings,
	movements,
] = await Promise.all([
	all<Ev>(
		"events",
		"id, project_id, status, client_name, event_date, grand_total, discount_amount, is_migrated_legacy, deleted_at, finance_frozen_at",
	),
	all<Rekap>("crew_rekap", "*"),
	all<Assign>(
		"crew_assignments",
		"id, event_id, user_id, role_in_event, fee_amount, bonus_amount, reimbursement_amount, total_fee, is_paid, paid_at, paid_via_account",
	),
	all<Settle>("event_settlements", "*"),
	all<JE>(
		"journal_entries",
		"id, ref_id, source_type, source_id, source_event_id, total_amount, is_reversed, entry_date",
	),
	all<JL>(
		"journal_lines",
		"entry_id, account_code, debit_amount, credit_amount",
	),
	all<Earn>(
		"owner_earnings",
		"id, owner_user_id, earning_type, amount, source_event_id, source_settlement_id",
	),
	all<Mov>(
		"stock_movements",
		"id, item_id, direction, quantity, source, source_id",
	),
]);

const evById = new Map(events.map((e) => [e.id, e]));

/**
 * Lingkup "hidup" = event yang masih ikut menentukan angka hari ini.
 *
 * Dikecualikan: data migrasi legacy, dan event yang dibekukan cutoff Juni
 * (finance_frozen_at). Cutoff mengosongkan 12 tabel buku besar, jadi rekap
 * pra-cutoff wajar kehilangan stock_movements/settlement-nya — kalau ikut
 * diuji, seluruh laporan tenggelam oleh temuan palsu.
 */
const isLive = (eventId: string) => {
	const e = evById.get(eventId);
	return !!e && !e.deleted_at && !e.is_migrated_legacy && !e.finance_frozen_at;
};
const liveRekaps = rekaps.filter((r) => isLive(r.event_id));
const liveAssigns = assigns.filter((a) => isLive(a.event_id));
const frozenCount = events.filter((e) => e.finance_frozen_at).length;
const label = (eventId: string) => {
	const e = evById.get(eventId);
	return e
		? `${e.project_id} ${e.client_name} (${e.event_date})`
		: `event ${eventId}`;
};
const n = (v: unknown) => Number(v ?? 0);

console.log("AUDIT RANTAI REKAP — crew → owner → pembukuan");
console.log(
	`data: ${events.length} event · ${rekaps.length} rekap · ${assigns.length} assignment · ` +
		`${settlements.length} settlement · ${entries.length} jurnal · ${earnings.length} bagi hasil`,
);
const legacy = events.filter((e) => e.is_migrated_legacy).length;
console.log(
	`lingkup hidup: ${liveRekaps.length} rekap · ${liveAssigns.length} assignment ` +
		`(dikecualikan: ${legacy} event legacy, ${frozenCount} event beku cutoff Juni)\n`,
);

// ════════════════════════════════════════════════════════════════════════
console.log("A. Rekap crew — bentuk & siklus hidup");

// A1 — satu event maksimal satu rekap
{
	const seen = new Map<string, number>();
	for (const r of rekaps) seen.set(r.event_id, (seen.get(r.event_id) ?? 0) + 1);
	const dup = [...seen.entries()].filter(([, c]) => c > 1);
	dup.length
		? report(
				"BUG",
				"A1",
				`${dup.length} event punya rekap ganda`,
				dup.map(([id, c]) => `${label(id)} → ${c} rekap`),
			)
		: report("OK", "A1", "tiap event maksimal satu rekap");
}

// A2 — rekap menunjuk event yang masih ada & belum dihapus
{
	const bad = rekaps.filter(
		(r) => !evById.has(r.event_id) || evById.get(r.event_id)?.deleted_at,
	);
	bad.length
		? report(
				"BUG",
				"A2",
				`${bad.length} rekap menempel di event yang hilang/terhapus`,
				bad.map((r) => `rekap ${r.id} → event ${r.event_id}`),
			)
		: report("OK", "A2", "semua rekap menempel di event yang hidup");
}

// A3 — approved wajib punya jejak reviewer
{
	const bad = rekaps.filter(
		(r) => r.is_approved === true && (!r.reviewed_by || !r.reviewed_at),
	);
	bad.length
		? report(
				"BUG",
				"A3",
				`${bad.length} rekap approved tanpa jejak siapa/kapan me-review`,
				bad.map((r) => label(r.event_id)),
			)
		: report("OK", "A3", "tiap rekap approved punya reviewer + waktu review");
}

// A4 — approved harus commit stok (kecuali konsumsinya memang nol)
{
	const suspect = liveRekaps.filter((r) => {
		if (r.is_approved !== true || r.stock_committed_at) return false;
		const used =
			n(r.media_set_used) +
			n(r.sleeve_used) +
			n(r.flashdisk_used) +
			n(r.pouch_used) +
			n(r.photomagnet_used) +
			n(r.keychain_used);
		return used > 0;
	});
	const zero =
		liveRekaps.filter((r) => r.is_approved === true && !r.stock_committed_at)
			.length - suspect.length;
	suspect.length
		? report(
				"BUG",
				"A4",
				`${suspect.length} rekap approved memakai bahan tapi stok tidak pernah di-commit (HPP & stok tidak ikut turun)`,
				suspect.map(
					(r) =>
						`${label(r.event_id)} — cetak ${n(r.cetak_total)}, mediaset ${n(r.media_set_used)}, sleeve ${n(r.sleeve_used)}`,
				),
			)
		: report(
				"OK",
				"A4",
				`commit stok konsisten (${zero} rekap tanpa commit memang nol pemakaian)`,
			);
}

// A5 — commit stok wajib meninggalkan gerakan stok yang nyata
{
	// Gerakan konsumsi ditautkan lewat source_id = EVENT id (lihat
	// reverseRekapStock di src/lib/actions/rekap.ts). Kolom
	// crew_rekap.stock_movement_batch_id hanya label — tidak ada satu baris
	// stock_movements pun yang menyimpannya, jadi jangan dipakai mencocokkan.
	const consumedEvents = new Set(
		movements
			.filter((m) => m.source === "rekap_consumption")
			.map((m) => m.source_id ?? ""),
	);
	const noMoves = liveRekaps.filter(
		(r) => r.stock_committed_at && !consumedEvents.has(r.event_id),
	);
	noMoves.length
		? report(
				"BUG",
				"A5",
				`${noMoves.length} rekap ter-commit tapi tidak ada gerakan stok konsumsinya`,
				noMoves.map((r) => label(r.event_id)),
			)
		: report("OK", "A5", "tiap rekap ter-commit punya gerakan stok konsumsi");
}

// A6 — snapshot HPP: total = jumlah rinciannya
{
	const bad: string[] = [];
	for (const r of rekaps) {
		const snap = r.hpp_snapshot as Record<string, unknown> | null;
		if (!snap || typeof snap !== "object") continue;
		const total = n(r.hpp_snapshot_total);
		// snapshot memuat kunci "total" bersama rinciannya — jangan dijumlahkan
		// lagi, kalau tidak hasilnya selalu dua kali lipat (positif palsu).
		const sum = Object.entries(snap).reduce<number>((s, [k, v]) => {
			if (k === "total") return s;
			if (typeof v === "number") return s + v;
			if (v && typeof v === "object") {
				const o = v as Record<string, unknown>;
				return s + n(o.total ?? o.amount ?? o.value);
			}
			return s;
		}, 0);
		if (sum > 0 && !near(sum, total, 2)) {
			bad.push(
				`${label(r.event_id)} — rincian ${rp(sum)} ≠ total ${rp(total)}`,
			);
		}
	}
	bad.length
		? report(
				"BUG",
				"A6",
				`${bad.length} snapshot HPP tidak sama dengan totalnya`,
				bad,
			)
		: report("OK", "A6", "snapshot HPP cocok dengan totalnya");
}

// A7 — biaya crew tidak negatif & lainnya_items berbentuk sah
{
	const bad: string[] = [];
	for (const r of rekaps) {
		for (const [k, v] of [
			["transport", r.transport_cost],
			["bensin", r.bensin_cost],
			["toll", r.toll_cost],
			["parkir", r.parking_cost],
			["konsumsi", r.konsumsi_cost],
		] as const) {
			if (n(v) < 0)
				bad.push(`${label(r.event_id)} — ${k} negatif (${rp(n(v))})`);
		}
		const items = r.lainnya_items;
		if (items != null && !Array.isArray(items)) {
			bad.push(
				`${label(r.event_id)} — lainnya_items bukan array (${typeof items})`,
			);
		} else if (Array.isArray(items)) {
			for (const [i, it] of items.entries()) {
				const o = it as Record<string, unknown>;
				if (
					!o ||
					typeof o !== "object" ||
					n(o.amount ?? o.cost ?? o.nominal) < 0
				) {
					bad.push(`${label(r.event_id)} — lainnya_items[${i}] tidak sah`);
				}
			}
		}
	}
	bad.length
		? report(
				"BUG",
				"A7",
				`${bad.length} nilai biaya crew tidak masuk akal`,
				bad,
			)
		: report(
				"OK",
				"A7",
				"biaya crew (transport/bensin/toll/parkir/konsumsi/lainnya) berbentuk sah",
			);
}

// A8 — expense_paid_by hanya boleh menunjuk pos biaya yang ada
{
	const KNOWN = new Set([
		"transport",
		"bensin",
		"toll",
		"parking",
		"konsumsi",
		"lainnya",
	]);
	const bad: string[] = [];
	for (const r of rekaps) {
		const pb = r.expense_paid_by as Record<string, unknown> | null;
		if (!pb || typeof pb !== "object") continue;
		for (const k of Object.keys(pb)) {
			const base = k.replace(/_\d+$/, "").replace(/^lainnya.*/, "lainnya");
			if (!KNOWN.has(base))
				bad.push(`${label(r.event_id)} — kunci "${k}" tidak dikenal`);
		}
	}
	bad.length
		? report(
				"WARN",
				"A8",
				`${bad.length} penanda "siapa yang bayar" memakai kunci di luar daftar`,
				bad,
			)
		: report(
				"OK",
				"A8",
				'penanda "siapa yang bayar" konsisten dengan pos biayanya',
			);
}

// ════════════════════════════════════════════════════════════════════════
console.log("\nB. Fee crew — hitungan & pembayaran");

// B1 — total_fee = fee + bonus + reimbursement
{
	const bad = assigns.filter((a) => {
		const sum = n(a.fee_amount) + n(a.bonus_amount) + n(a.reimbursement_amount);
		return a.total_fee != null && !near(sum, n(a.total_fee));
	});
	bad.length
		? report(
				"BUG",
				"B1",
				`${bad.length} assignment: total_fee ≠ fee + bonus + reimbursement`,
				bad.map(
					(a) =>
						`${label(a.event_id)} — tersimpan ${rp(n(a.total_fee))}, seharusnya ${rp(n(a.fee_amount) + n(a.bonus_amount) + n(a.reimbursement_amount))}`,
				),
			)
		: report("OK", "B1", "total fee tiap crew = fee + bonus + reimbursement");
}

// B2 — nilai fee tidak negatif
{
	const bad = assigns.filter(
		(a) =>
			n(a.fee_amount) < 0 ||
			n(a.bonus_amount) < 0 ||
			n(a.reimbursement_amount) < 0,
	);
	bad.length
		? report(
				"BUG",
				"B2",
				`${bad.length} assignment bernilai negatif`,
				bad.map((a) => label(a.event_id)),
			)
		: report("OK", "B2", "tidak ada fee/bonus/reimbursement negatif");
}

// B3 — sudah dibayar wajib punya tanggal + rekening
{
	const bad = liveAssigns.filter(
		(a) => a.is_paid && (!a.paid_at || !a.paid_via_account),
	);
	bad.length
		? report(
				"BUG",
				"B3",
				`${bad.length} fee ditandai lunas tanpa tanggal/rekening pembayaran`,
				bad.map(
					(a) =>
						`${label(a.event_id)} — paid_at=${a.paid_at ?? "kosong"}, rekening=${a.paid_via_account ?? "kosong"}`,
				),
			)
		: report("OK", "B3", "tiap fee lunas punya tanggal + rekening");
}

// B4 — saldo utang fee crew (2-100) = sisa yang benar-benar bisa dibayar app
{
	const entryById = new Map(entries.map((e) => [e.id, e]));
	let saldo2100 = 0;
	for (const l of lines) {
		if (l.account_code !== "2-100") continue;
		if (entryById.get(l.entry_id)?.is_reversed) continue;
		saldo2100 += n(l.credit_amount) - n(l.debit_amount);
	}
	// Utang baru lahir saat settle, jadi pembandingnya = fee yang belum dibayar
	// pada event yang SUDAH di-settle. Yang bisa dibayar lewat aplikasi hanyalah
	// fee+bonus+reimbursement yang tersimpan di crew_assignments.
	const settledIds = new Set(settlements.map((s) => s.event_id));
	const belum = assigns
		.filter((a) => !a.is_paid && settledIds.has(a.event_id))
		.reduce(
			(s, a) =>
				s + n(a.fee_amount) + n(a.bonus_amount) + n(a.reimbursement_amount),
			0,
		);
	near(saldo2100, belum, 1)
		? report(
				"OK",
				"B4",
				`utang fee crew cocok: buku besar 2-100 ${rp(saldo2100)} = sisa yang bisa dibayar ${rp(belum)}`,
			)
		: report(
				"BUG",
				"B4",
				`utang fee crew menggantung: buku besar 2-100 ${rp(saldo2100)}, tapi yang bisa dibayar lewat aplikasi ${rp(belum)} — selisih ${rp(saldo2100 - belum)} tidak muncul di layar mana pun`,
			);
}

// B4b — per event: kredit 2-100 saat settle vs fee yang tersimpan di assignment
// Inilah sumber selisih B4: settle_event menganggap SELURUH biaya di rekap
// ditalangi crew, sedangkan yang bisa dibayar cuma reimbursement_amount yang
// diisi manual per crew.
{
	const bad: string[] = [];
	let totalDrift = 0;
	for (const s of settlements) {
		// SELURUH jurnal event ini yang MENGKREDIT 2-100, bukan cuma jurnal
		// settlement: koreksi manual (mis. pembulatan talangan jadi bonus crew)
		// juga menambah utang yang sah. Pembayaran fee mendebit 2-100, jadi tidak
		// ikut terhitung di sini.
		const je = entries.filter(
			(e) => e.source_event_id === s.event_id && !e.is_reversed,
		);
		const kredit = lines
			.filter(
				(l) =>
					l.account_code === "2-100" && je.some((e) => e.id === l.entry_id),
			)
			.reduce((t, l) => t + n(l.credit_amount), 0);
		const payable = assigns
			.filter((a) => a.event_id === s.event_id)
			.reduce(
				(t, a) =>
					t + n(a.fee_amount) + n(a.bonus_amount) + n(a.reimbursement_amount),
				0,
			);
		if (kredit > 0 && !near(kredit, payable, 1)) {
			totalDrift += kredit - payable;
			bad.push(
				`${label(s.event_id)} — jurnal mengutangi crew ${rp(kredit)}, yang bisa dibayar ${rp(payable)} → ${kredit > payable ? "kurang bayar" : "kelebihan"} ${rp(Math.abs(kredit - payable))}`,
			);
		}
	}
	bad.length
		? report(
				"BUG",
				"B4b",
				`${bad.length} dari ${settlements.length} settlement mengutangi crew lebih besar/kecil dari yang bisa dibayar (total ${rp(totalDrift)})`,
				bad,
			)
		: report(
				"OK",
				"B4b",
				"utang crew tiap settlement sama dengan yang bisa dibayar",
			);
}

// B4c — komisi TIDAK boleh ikut jadi utang crew
// Komisi vendor/relasi/sales punya akun utangnya sendiri (2-101/2-102). Yang
// dikreditkan ke 2-100 harus opex_total dikurangi komisi; kalau tidak, satu
// utang tercatat dua kali di dua akun berbeda.
{
	const bad: string[] = [];
	for (const s of settlements) {
		const je = entries.filter(
			(e) =>
				e.source_type === "settlement" &&
				e.source_event_id === s.event_id &&
				!e.is_reversed,
		);
		const kredit = lines
			.filter(
				(l) =>
					l.account_code === "2-100" && je.some((e) => e.id === l.entry_id),
			)
			.reduce((t, l) => t + n(l.credit_amount), 0);
		const komisi =
			n(s.komisi_vendor) + n(s.komisi_relasi) + n(s.komisi_sales_direct);
		const expected = n(s.opex_total) - komisi;
		if (kredit > 0 && !near(kredit, expected, 1)) {
			bad.push(
				`${label(s.event_id)} — kredit 2-100 ${rp(kredit)}, seharusnya OpEx−komisi ${rp(expected)}`,
			);
		}
	}
	bad.length
		? report(
				"BUG",
				"B4c",
				`${bad.length} settlement: utang crew tidak sama dengan OpEx dikurangi komisi`,
				bad,
			)
		: report(
				"OK",
				"B4c",
				"komisi tidak ikut dikreditkan ke utang crew (punya akun sendiri)",
			);
}

// B5 — fee lunas harus punya jurnal pembayaran
{
	const paidWithAcct = liveAssigns.filter(
		(a) => a.is_paid && a.paid_via_account,
	);
	const feeEntries = entries.filter((e) => e.source_type === "crew_payment");
	paidWithAcct.length !== feeEntries.length
		? report(
				"WARN",
				"B5",
				`${paidWithAcct.length} fee tercatat lunas tapi ada ${feeEntries.length} jurnal crew_payment — tidak satu-satu`,
			)
		: report(
				"OK",
				"B5",
				`${paidWithAcct.length} fee lunas, tiap satu punya jurnal crew_payment`,
			);
}

// ════════════════════════════════════════════════════════════════════════
console.log("\nC. Settlement — aritmetika & jurnal");

// C1 — komponen HPP menjumlah ke hpp_total
{
	const bad = settlements.filter((s) => {
		const sum =
			n(s.hpp_mediaset) +
			n(s.hpp_sleeve) +
			n(s.hpp_flashdisk) +
			n(s.hpp_pouch) +
			n(s.hpp_photomagnet) +
			n(s.hpp_keychain) +
			n(s.hpp_other) +
			n(s.hpp_bonus);
		return !near(sum, n(s.hpp_total), 2);
	});
	bad.length
		? report(
				"BUG",
				"C1",
				`${bad.length} settlement: rincian HPP ≠ hpp_total`,
				bad.map((s) => `${label(s.event_id)} — total ${rp(n(s.hpp_total))}`),
			)
		: report("OK", "C1", "rincian HPP menjumlah tepat ke hpp_total");
}

// C2 — komponen OpEx menjumlah ke opex_total
{
	const bad = settlements.filter((s) => {
		const sum =
			n(s.fee_lead) +
			n(s.fee_asisten) +
			n(s.fee_crew_c) +
			n(s.fee_extra) +
			n(s.transport_bbm) +
			n(s.sewa_alat) +
			n(s.perawatan) +
			n(s.konsumsi) +
			n(s.komisi_vendor) +
			n(s.komisi_relasi) +
			n(s.komisi_sales_direct) +
			n(s.platform_fee) +
			n(s.diskon_tambahan);
		return !near(sum, n(s.opex_total), 2);
	});
	bad.length
		? report(
				"BUG",
				"C2",
				`${bad.length} settlement: rincian OpEx ≠ opex_total`,
				bad.map((s) => {
					const sum =
						n(s.fee_lead) +
						n(s.fee_asisten) +
						n(s.fee_crew_c) +
						n(s.fee_extra) +
						n(s.transport_bbm) +
						n(s.sewa_alat) +
						n(s.perawatan) +
						n(s.konsumsi) +
						n(s.komisi_vendor) +
						n(s.komisi_relasi) +
						n(s.komisi_sales_direct) +
						n(s.platform_fee) +
						n(s.diskon_tambahan);
					return `${label(s.event_id)} — rincian ${rp(sum)} vs opex_total ${rp(n(s.opex_total))}`;
				}),
			)
		: report("OK", "C2", "rincian OpEx menjumlah tepat ke opex_total");
}

// C3 — laba = pendapatan − HPP − OpEx, dan total_biaya konsisten
{
	const bad: string[] = [];
	for (const s of settlements) {
		const expected = n(s.revenue_net) - n(s.hpp_total) - n(s.opex_total);
		if (!near(expected, n(s.net_profit), 2)) {
			bad.push(
				`${label(s.event_id)} — laba tersimpan ${rp(n(s.net_profit))}, hitungan ${rp(expected)}`,
			);
		}
		if (!near(n(s.hpp_total) + n(s.opex_total), n(s.total_biaya), 2)) {
			bad.push(
				`${label(s.event_id)} — total_biaya ${rp(n(s.total_biaya))} ≠ HPP+OpEx ${rp(n(s.hpp_total) + n(s.opex_total))}`,
			);
		}
	}
	bad.length
		? report(
				"BUG",
				"C3",
				`${bad.length} settlement dengan aritmetika laba/biaya meleset`,
				bad,
			)
		: report(
				"OK",
				"C3",
				"laba bersih = pendapatan − HPP − OpEx di semua settlement",
			);
}

// C4 — margin persen konsisten dengan laba
{
	const bad = settlements.filter((s) => {
		const rev = n(s.revenue_net);
		if (rev <= 0) return false;
		return !near((n(s.net_profit) / rev) * 100, n(s.margin_percentage), 0.6);
	});
	bad.length
		? report(
				"BUG",
				"C4",
				`${bad.length} settlement dengan margin% tidak sesuai labanya`,
				bad.map(
					(s) =>
						`${label(s.event_id)} — tersimpan ${n(s.margin_percentage)}%, hitungan ${((n(s.net_profit) / n(s.revenue_net)) * 100).toFixed(1)}%`,
				),
			)
		: report("OK", "C4", "margin persen konsisten dengan laba bersih");
}

// C5 — dana cadangan menjumlah ke sinking_total
{
	const bad = settlements.filter((s) => {
		const sum =
			n(s.sinking_equipment) +
			n(s.sinking_maintenance) +
			n(s.sinking_crew_reserve) +
			n(s.sinking_emergency);
		return !near(sum, n(s.sinking_total), 2);
	});
	bad.length
		? report(
				"BUG",
				"C5",
				`${bad.length} settlement: rincian dana cadangan ≠ sinking_total`,
				bad.map((s) => label(s.event_id)),
			)
		: report("OK", "C5", "rincian dana cadangan menjumlah tepat");
}

// C6 — tiap settlement punya jurnal yang hidup
{
	const entryById = new Map(entries.map((e) => [e.id, e]));
	const bad = settlements.filter((s) => {
		if (!s.journal_entry_id) return true;
		const e = entryById.get(s.journal_entry_id);
		return !e || (e.is_reversed && !s.is_reopened);
	});
	bad.length
		? report(
				"BUG",
				"C6",
				`${bad.length} settlement tanpa jurnal hidup`,
				bad.map(
					(s) =>
						`${label(s.event_id)} — journal_entry_id=${s.journal_entry_id ?? "kosong"}`,
				),
			)
		: report("OK", "C6", "tiap settlement punya jurnal yang belum dibatalkan");
}

// C7 — jurnal settlement harus balance (debit = kredit)
{
	const byEntry = new Map<string, { d: number; c: number }>();
	for (const l of lines) {
		const cur = byEntry.get(l.entry_id) ?? { d: 0, c: 0 };
		cur.d += n(l.debit_amount);
		cur.c += n(l.credit_amount);
		byEntry.set(l.entry_id, cur);
	}
	const unbalanced = entries.filter((e) => {
		const t = byEntry.get(e.id);
		return t && !near(t.d, t.c, 1);
	});
	unbalanced.length
		? report(
				"BUG",
				"C7",
				`${unbalanced.length} jurnal tidak balance (debit ≠ kredit)`,
				unbalanced.map((e) => {
					const t = byEntry.get(e.id) as { d: number; c: number };
					return `${e.ref_id} (${e.source_type}) — D ${rp(t.d)} vs K ${rp(t.c)}`;
				}),
			)
		: report("OK", "C7", `${entries.length} jurnal semuanya balance`);
}

// C8 — event selesai wajib punya settlement (kecuali legacy / belum ada rekap)
{
	const settledIds = new Set(settlements.map((s) => s.event_id));
	const bad = events.filter(
		(e) => e.status === "completed" && isLive(e.id) && !settledIds.has(e.id),
	);
	bad.length
		? report(
				"WARN",
				"C8",
				`${bad.length} event berstatus selesai tapi belum di-settle (uang & laba belum masuk buku)`,
				bad.map((e) => `${e.project_id} ${e.client_name} (${e.event_date})`),
			)
		: report("OK", "C8", "semua event selesai (non-legacy) sudah di-settle");
}

// C9 — settlement wajib punya rekap yang mendahuluinya
{
	const rekapByEvent = new Map(rekaps.map((r) => [r.event_id, r]));
	const bad = settlements.filter((s) => !rekapByEvent.has(s.event_id));
	bad.length
		? report(
				"BUG",
				"C9",
				`${bad.length} settlement tanpa rekap crew — HPP-nya dari mana?`,
				bad.map((s) => label(s.event_id)),
			)
		: report("OK", "C9", "tiap settlement punya rekap crew");
}

// C10 — rekap tertutup (settled) harus benar-benar punya settlement
{
	const settledIds = new Set(settlements.map((s) => s.event_id));
	const bad = liveRekaps.filter(
		(r) =>
			(r.settled_at || r.status === "settled") && !settledIds.has(r.event_id),
	);
	bad.length
		? report(
				"BUG",
				"C10",
				`${bad.length} rekap ditandai "settled" padahal settlement-nya tidak ada`,
				bad.map(
					(r) =>
						`${label(r.event_id)} — settled_at=${r.settled_at ?? "kosong"}, status=${r.status}`,
				),
			)
		: report("OK", "C10", "penanda settled di rekap cocok dengan settlement");
}

// ════════════════════════════════════════════════════════════════════════
console.log("\nD. Bagi hasil owner & buku besar");

// D1 — owner_pool_total settlement = jumlah owner_earnings-nya
{
	const bySettlement = new Map<string, number>();
	for (const e of earnings) {
		if (!e.source_settlement_id) continue;
		bySettlement.set(
			e.source_settlement_id,
			(bySettlement.get(e.source_settlement_id) ?? 0) + n(e.amount),
		);
	}
	const bad = settlements.filter((s) => {
		const got = bySettlement.get(s.id) ?? 0;
		return !near(got, n(s.owner_pool_total), 1);
	});
	bad.length
		? report(
				"BUG",
				"D1",
				`${bad.length} settlement: bagi hasil tercatat ≠ owner_pool_total`,
				bad.map(
					(s) =>
						`${label(s.event_id)} — pool ${rp(n(s.owner_pool_total))}, tercatat ${rp(bySettlement.get(s.id) ?? 0)}`,
				),
			)
		: report(
				"OK",
				"D1",
				"bagi hasil owner tiap settlement sama dengan pool-nya",
			);
}

// D2 — saldo 2-300 = bagi hasil yang belum diambil
{
	const entryById = new Map(entries.map((e) => [e.id, e]));
	let saldo = 0;
	for (const l of lines) {
		if (l.account_code !== "2-300") continue;
		if (entryById.get(l.entry_id)?.is_reversed) continue;
		saldo += n(l.credit_amount) - n(l.debit_amount);
	}
	const belumDiambil = earnings.reduce(
		(s, e) =>
			s +
			(e.earning_type === "withdrawal" ? -Math.abs(n(e.amount)) : n(e.amount)),
		0,
	);
	near(saldo, belumDiambil, 1)
		? report(
				"OK",
				"D2",
				`bagi hasil siap diambil cocok: buku besar 2-300 ${rp(saldo)} = catatan ${rp(belumDiambil)}`,
			)
		: report(
				"WARN",
				"D2",
				`bagi hasil: buku besar 2-300 ${rp(saldo)} vs catatan owner_earnings ${rp(belumDiambil)} (selisih ${rp(saldo - belumDiambil)})`,
			);
}

// D3 — jurnal yang menunjuk event hantu
{
	const bad = entries.filter(
		(e) => e.source_event_id && !evById.has(e.source_event_id),
	);
	bad.length
		? report(
				"BUG",
				"D3",
				`${bad.length} jurnal menunjuk event yang sudah tidak ada`,
				bad.map((e) => `${e.ref_id} → ${e.source_event_id}`),
			)
		: report("OK", "D3", "tidak ada jurnal yang menunjuk event hantu");
}

// D4 — gerakan stok dari rekap harus menunjuk rekap yang ada
{
	const rekapEvents = new Set(rekaps.map((r) => r.event_id));
	const orphan = movements.filter(
		(m) =>
			m.source === "rekap_consumption" &&
			m.source_id &&
			!rekapEvents.has(m.source_id),
	);
	orphan.length
		? report(
				"WARN",
				"D4",
				`${orphan.length} gerakan stok dari event tidak punya rekap yang cocok`,
				orphan.map((m) => `${m.id} source_id=${m.source_id}`),
			)
		: report("OK", "D4", "gerakan stok dari event semuanya punya rekap");
}

// ════════════════════════════════════════════════════════════════════════
console.log("\nE. Operasional — yang menggantung");

// E1 — event sudah lewat, rekap belum diisi
{
	const today = new Date().toISOString().slice(0, 10);
	const rekapEvents = new Set(rekaps.map((r) => r.event_id));
	const bad = events.filter(
		(e) =>
			isLive(e.id) &&
			e.event_date < today &&
			e.status !== "upcoming" &&
			!rekapEvents.has(e.id),
	);
	bad.length
		? report(
				"WARN",
				"E1",
				`${bad.length} event sudah lewat tapi rekapnya belum ada`,
				bad.map((e) => `${e.project_id} ${e.client_name} (${e.event_date})`),
			)
		: report("OK", "E1", "semua event yang sudah lewat punya rekap");
}

// E2 — rekap masuk tapi belum di-review owner
{
	const bad = rekaps.filter(
		(r) => r.status === "submitted" && r.is_approved !== true,
	);
	bad.length
		? report(
				"WARN",
				"E2",
				`${bad.length} rekap menunggu review owner`,
				bad.map((r) => label(r.event_id)),
			)
		: report("OK", "E2", "tidak ada rekap yang menunggu review");
}

// E3 — fee crew yang belum dibayar pada event yang sudah selesai
{
	const settledIds = new Set(settlements.map((s) => s.event_id));
	const bad = assigns.filter(
		(a) =>
			!a.is_paid &&
			settledIds.has(a.event_id) &&
			n(a.fee_amount) + n(a.bonus_amount) + n(a.reimbursement_amount) > 0,
	);
	const total = bad.reduce(
		(s, a) =>
			s + n(a.fee_amount) + n(a.bonus_amount) + n(a.reimbursement_amount),
		0,
	);
	bad.length
		? report(
				"WARN",
				"E3",
				`${bad.length} fee crew belum dibayar untuk event yang sudah di-settle — total ${rp(total)}`,
				bad.map(
					(a) =>
						`${label(a.event_id)} — ${a.role_in_event} ${rp(n(a.fee_amount) + n(a.bonus_amount) + n(a.reimbursement_amount))}`,
				),
			)
		: report(
				"OK",
				"E3",
				"tidak ada fee crew tertunggak di event yang sudah di-settle",
			);
}

// E4 — event beku (finance_frozen_at) tapi masih punya rekap terbuka
{
	const bad = rekaps.filter((r) => {
		const e = evById.get(r.event_id);
		return e?.finance_frozen_at && r.status !== "settled" && !r.locked;
	});
	bad.length
		? report(
				"WARN",
				"E4",
				`${bad.length} rekap masih terbuka padahal keuangan eventnya sudah dibekukan cutoff`,
				bad.map((r) => label(r.event_id)),
			)
		: report(
				"OK",
				"E4",
				"tidak ada rekap terbuka di event yang keuangannya dibekukan",
			);
}

// ── Ringkasan ───────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(72)}`);
console.log(
	`RINGKASAN: ${tally.OK} lolos · ${tally.WARN} perlu dilihat · ${tally.BUG} bermasalah`,
);
if (tally.BUG > 0) {
	console.log("\nYang bermasalah:");
	for (const f of findings.filter((x) => x.level === "BUG")) {
		console.log(`  [${f.code}] ${f.msg}`);
	}
}
if (tally.WARN > 0) {
	console.log("\nYang perlu dilihat:");
	for (const f of findings.filter((x) => x.level === "WARN")) {
		console.log(`  [${f.code}] ${f.msg}`);
	}
}
process.exit(tally.BUG > 0 ? 1 : 0);
