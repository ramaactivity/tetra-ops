/**
 * Talangan crew — menyamakan "utang yang dibukukan" dengan "yang bisa dibayar".
 *
 * Masalah yang ditutup di sini:
 *   settle_event mengkredit 2-100 Hutang Crew sebesar OpEx (fee + bonus +
 *   biaya lapangan yang DITALANGI CREW), sedangkan tombol bayar di aplikasi
 *   hanya bisa membayar `fee_amount + bonus_amount + reimbursement_amount`
 *   dari crew_assignments. reimbursement_amount itu diketik manual owner —
 *   kalau lupa, selisihnya mengendap di 2-100 selamanya dan TIDAK muncul di
 *   layar mana pun. Per audit 2026-08-07: Rp604.500 mengendap dari 3 event.
 *
 * Jadi sebelum settle, talangan di rekap disalin ke crew yang menalangi.
 * Aturan "mana yang ditalangi crew" SENGAJA dijaga identik dengan
 * calculate_recap_opex (migration 20260806_rekap_expense_paid_by): tanpa
 * penanda, biaya dianggap ditalangi crew; yang bertanda "owner" tidak ikut.
 */

import { isFrontedByPerson } from "@/lib/finance/emoney";

export type RekapExpenseSource = {
	transport_cost: number | string | null;
	bensin_cost: number | string | null;
	toll_cost: number | string | null;
	parking_cost: number | string | null;
	konsumsi_cost: number | string | null;
	lainnya_items: unknown;
	expense_paid_by: unknown;
	submitted_by: string | null;
};

const num = (v: unknown) => Math.round(Number(v ?? 0)) || 0;

/**
 * Total biaya lapangan yang ditalangi crew — cermin calculate_recap_opex.
 *
 * Dua bentuk pembayar yang BUKAN talangan crew:
 *   'owner'             dibayar owner pakai uang pribadi
 *   'acct:<uuid akun>'  dibayar langsung dari saldo perusahaan (kartu e-toll,
 *                       kas, bank) — uangnya sudah keluar waktu topup, tidak
 *                       ada yang perlu diganti ke crew.
 * Tanpa penyaringan kedua, tap e-toll pakai kartu perusahaan akan jadi
 * reimbursement fiktif ke crew.
 */
export function crewFrontedExpenses(rekap: RekapExpenseSource): number {
	const paidBy = (
		rekap.expense_paid_by && typeof rekap.expense_paid_by === "object"
			? rekap.expense_paid_by
			: {}
	) as Record<string, unknown>;
	const notFronted = (value: unknown) => !isFrontedByPerson(value ?? "crew");

	let total = 0;
	for (const [key, value] of [
		["transport", rekap.transport_cost],
		["bensin", rekap.bensin_cost],
		["toll", rekap.toll_cost],
		["parking", rekap.parking_cost],
		["konsumsi", rekap.konsumsi_cost],
	] as const) {
		if (!notFronted(paidBy[key])) total += num(value);
	}

	if (Array.isArray(rekap.lainnya_items)) {
		for (const raw of rekap.lainnya_items) {
			const item = (raw ?? {}) as Record<string, unknown>;
			const amount = num(item.amount);
			if (amount <= 0) continue;
			if (notFronted(item.paid_by)) continue;
			total += amount;
		}
	}
	return total;
}

/**
 * Pemegang uang jalan acara ini (DR-049), atau null kalau tidak ada uang jalan.
 * Satu aturan untuk semua permukaan: biaya yang "belum dipilih siapa yang
 * bayar" dianggap dibayar pemegang uang jalan — sama dengan form crew, yang
 * otomatis mengganti "crew" menjadi pemegang uang jalan.
 */
export function pemegangUangJalan(
	rekap: { uj_terima?: number | string | null; uj_holder?: string | null },
	/** users.id penerima uang jalan (catatan "beri" yang tidak dibatalkan). */
	penerima: string[],
): string | null {
	if (num(rekap.uj_terima) <= 0 && penerima.length === 0) return null;
	return rekap.uj_holder || penerima[0] || null;
}

/**
 * Talangan per crew (users.id) — cermin crewFrontedExpenses, dipilah per
 * penalang. Biaya tanpa penalang jatuh ke `penalangBawaan` (pemegang uang
 * jalan), kalau tidak ada masuk `tanpaPenalang`.
 */
export function talanganPerCrew(
	rekap: RekapExpenseSource,
	penalangBawaan: string | null,
): { byUser: Record<string, number>; tanpaPenalang: number } {
	const paidBy = (
		rekap.expense_paid_by && typeof rekap.expense_paid_by === "object"
			? rekap.expense_paid_by
			: {}
	) as Record<string, unknown>;
	const byUser: Record<string, number> = {};
	let tanpaPenalang = 0;
	const add = (payer: unknown, amount: number) => {
		if (amount <= 0 || !isFrontedByPerson(payer ?? "crew")) return;
		const who =
			typeof payer === "string" && payer && payer !== "crew"
				? payer
				: penalangBawaan;
		if (who) byUser[who] = (byUser[who] ?? 0) + amount;
		else tanpaPenalang += amount;
	};
	add(paidBy.transport, num(rekap.transport_cost));
	add(paidBy.bensin, num(rekap.bensin_cost));
	add(paidBy.toll, num(rekap.toll_cost));
	add(paidBy.parking, num(rekap.parking_cost));
	add(paidBy.konsumsi, num(rekap.konsumsi_cost));
	if (Array.isArray(rekap.lainnya_items))
		for (const raw of rekap.lainnya_items) {
			const item = (raw ?? {}) as Record<string, unknown>;
			add(item.paid_by, num(item.amount));
		}
	return { byUser, tanpaPenalang };
}

type SupabaseLike = {
	from: (table: string) => {
		// biome-ignore lint/suspicious/noExplicitAny: rantai builder PostgREST
		select: (cols: string) => any;
		// biome-ignore lint/suspicious/noExplicitAny: idem
		update: (values: any) => any;
	};
};

export type ReimbursementSync = {
	/** Talangan crew menurut rekap. */
	expected: number;
	/** Yang sudah tercatat di crew_assignments sebelum penyesuaian. */
	before: number;
	/** Sesudah penyesuaian — sama dengan expected kalau berhasil. */
	after: number;
	/** Alasan kalau tidak bisa disamakan (mis. semua crew sudah dibayar). */
	blocked?: string;
};

/**
 * Samakan reimbursement_amount tiap crew dengan talangan di rekap.
 *
 * Tiap crew menerima persis yang dia talangi (penalang per biaya); biaya tanpa
 * penalang jatuh ke pemegang uang jalan (DR-049) — kalau tidak ada uang jalan,
 * ke crew yang mengisi rekap, lalu lead, lalu assignment pertama. Dulu SELURUH
 * selisih dibebankan ke yang mengisi rekap, jadi kalau pemegang uang jalan
 * orang lain, reimbursement-nya jatuh ke crew yang salah sementara uang jalan
 * dipotong dari fee pemegangnya.
 *
 * Crew yang fee-nya SUDAH dibayar tidak disentuh — angkanya sudah menjadi
 * kas keluar; bagiannya yang belum tertutup dibebankan ke target cadangan.
 *
 * Idempoten: dipanggil dua kali, panggilan kedua tidak mengubah apa pun.
 */
export async function syncCrewReimbursement(
	supabase: SupabaseLike,
	eventId: string,
): Promise<ReimbursementSync | null> {
	const { data: rekap } = await supabase
		.from("crew_rekap")
		.select(
			"transport_cost, bensin_cost, toll_cost, parking_cost, konsumsi_cost, lainnya_items, expense_paid_by, submitted_by, uj_terima, uj_holder",
		)
		.eq("event_id", eventId)
		.maybeSingle();
	if (!rekap) return null;
	const src = rekap as RekapExpenseSource & {
		uj_terima: number | string | null;
		uj_holder: string | null;
	};

	const { data: beri } = await supabase
		.from("uang_jalan")
		.select("user_id, kind, is_reversed")
		.eq("event_id", eventId);
	const penerima = [
		...new Set(
			(
				(beri ?? []) as Array<{
					user_id: string;
					kind: string;
					is_reversed: boolean;
				}>
			)
				.filter((b) => b.kind === "beri" && !b.is_reversed)
				.map((b) => b.user_id),
		),
	];
	const expected = crewFrontedExpenses(src);
	const { byUser } = talanganPerCrew(src, pemegangUangJalan(src, penerima));

	const { data: rows } = await supabase
		.from("crew_assignments")
		.select("id, user_id, role_in_event, reimbursement_amount, is_paid")
		.eq("event_id", eventId);
	const assignments = (rows ?? []) as Array<{
		id: string;
		user_id: string;
		role_in_event: string;
		reimbursement_amount: number | string | null;
		is_paid: boolean | null;
	}>;
	if (assignments.length === 0) return null;

	const before = assignments.reduce(
		(s, a) => s + num(a.reimbursement_amount),
		0,
	);
	const unpaid = assignments.filter((a) => !a.is_paid);
	const target =
		unpaid.find((a) => a.user_id === src.submitted_by) ??
		unpaid.find((a) => a.role_in_event === "lead") ??
		unpaid[0];
	if (!target) {
		return before === expected
			? { expected, before, after: before }
			: {
					expected,
					before,
					after: before,
					blocked:
						"semua fee crew sudah dibayar — talangan tidak bisa disesuaikan lagi",
				};
	}

	// Bagian tiap crew yang belum dibayar; sisanya (tanpa penalang, penalang
	// tidak ter-assign / sudah dibayar) ke target supaya totalnya tetap pas.
	const paidSum = assignments
		.filter((a) => a.is_paid)
		.reduce((s, a) => s + num(a.reimbursement_amount), 0);
	const want = new Map(unpaid.map((a) => [a.id, num(byUser[a.user_id])]));
	const assigned = [...want.values()].reduce((s, v) => s + v, 0);
	want.set(
		target.id,
		Math.max(0, (want.get(target.id) ?? 0) + expected - paidSum - assigned),
	);

	let after = paidSum;
	for (const a of unpaid) {
		const next = want.get(a.id) ?? 0;
		after += next;
		if (next === num(a.reimbursement_amount)) continue;
		const { error } = await supabase
			.from("crew_assignments")
			.update({ reimbursement_amount: next })
			.eq("id", a.id);
		if (error)
			return { expected, before, after: before, blocked: error.message };
	}
	return { expected, before, after };
}
