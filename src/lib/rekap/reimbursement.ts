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

/** Total biaya lapangan yang ditalangi crew — cermin calculate_recap_opex. */
export function crewFrontedExpenses(rekap: RekapExpenseSource): number {
	const paidBy = (
		rekap.expense_paid_by && typeof rekap.expense_paid_by === "object"
			? rekap.expense_paid_by
			: {}
	) as Record<string, unknown>;
	const byOwner = (key: string) => String(paidBy[key] ?? "crew") === "owner";

	let total = 0;
	for (const [key, value] of [
		["transport", rekap.transport_cost],
		["bensin", rekap.bensin_cost],
		["toll", rekap.toll_cost],
		["parking", rekap.parking_cost],
		["konsumsi", rekap.konsumsi_cost],
	] as const) {
		if (!byOwner(key)) total += num(value);
	}

	if (Array.isArray(rekap.lainnya_items)) {
		for (const raw of rekap.lainnya_items) {
			const item = (raw ?? {}) as Record<string, unknown>;
			const amount = num(item.amount);
			if (amount <= 0) continue;
			if (String(item.paid_by ?? "crew") === "owner") continue;
			total += amount;
		}
	}
	return total;
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
 * Samakan Σ reimbursement_amount event ini dengan talangan di rekap.
 *
 * Selisihnya dibebankan ke crew yang mengisi rekap (dialah yang menalangi);
 * kalau dia tidak ter-assign, jatuh ke lead, lalu ke assignment pertama.
 * Crew yang fee-nya SUDAH dibayar tidak disentuh — angkanya sudah menjadi
 * kas keluar, mengubahnya hanya memindahkan selisih ke tempat lain.
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
			"transport_cost, bensin_cost, toll_cost, parking_cost, konsumsi_cost, lainnya_items, expense_paid_by, submitted_by",
		)
		.eq("event_id", eventId)
		.maybeSingle();
	if (!rekap) return null;

	const expected = crewFrontedExpenses(rekap as RekapExpenseSource);

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
	if (before === expected) return { expected, before, after: before };

	const submitter = (rekap as RekapExpenseSource).submitted_by;
	const target =
		assignments.find((a) => !a.is_paid && a.user_id === submitter) ??
		assignments.find((a) => !a.is_paid && a.role_in_event === "lead") ??
		assignments.find((a) => !a.is_paid);
	if (!target) {
		return {
			expected,
			before,
			after: before,
			blocked:
				"semua fee crew sudah dibayar — talangan tidak bisa disesuaikan lagi",
		};
	}

	// Sisa talangan yang belum menempel di crew mana pun, dibebankan ke target.
	const others = before - num(target.reimbursement_amount);
	const next = Math.max(0, expected - others);
	const { error } = await supabase
		.from("crew_assignments")
		.update({ reimbursement_amount: next })
		.eq("id", target.id);
	if (error) {
		return { expected, before, after: before, blocked: error.message };
	}
	return { expected, before, after: others + next };
}
