import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hutang Crew belum dibayar — SATU sumber kebenaran untuk halaman Finance dan
 * bot Telegram (/crew), supaya angkanya tidak pernah beda.
 *
 * Aturannya bukan sekadar `is_paid = false`: hanya assignment dari event yang
 * ter-settle DI BUKU SEKARANG (punya event_settlements dengan
 * closed_at >= finance_cutoff_date) yang dihitung. Event lama yang ditutup
 * pre-cutoff sudah di-freeze tanpa posting buku, jadi is_paid-nya stale dan
 * saldonya TIDAK ada di COA 2-100. Kalau ikut dihitung, totalnya tidak cocok
 * dengan Buku Besar — persis kesalahan yang dulu bikin bot melaporkan utang
 * crew jutaan rupiah padahal buku bilang nol.
 */

// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic client (SSR atau admin)
type AnySupabase = SupabaseClient<any, any, any>;

export type UnpaidCrewRow = {
	id: string;
	amount: number;
	crewName: string;
	closedAt: string | null;
	event: {
		project_id: string;
		client_name: string;
		event_date: string;
	} | null;
};

export type UnpaidCrewResult = {
	rows: UnpaidCrewRow[]; // urut nominal terbesar
	total: number;
};

/** Tanggal cutoff keuangan (system_config), null kalau belum pernah di-set. */
export async function getFinanceCutoffDate(
	supabase: AnySupabase,
): Promise<string | null> {
	const { data } = await supabase
		.from("system_config")
		.select("value")
		.eq("key", "finance_cutoff_date")
		.maybeSingle();
	return typeof data?.value === "string" && data.value.length > 0
		? data.value
		: null;
}

type UnpaidEvent = {
	project_id: string;
	client_name: string;
	event_date: string;
	settlement: { closed_at: string } | Array<{ closed_at: string }> | null;
};

export async function listUnpaidCrew(
	supabase: AnySupabase,
	cutoffDate?: string | null,
): Promise<UnpaidCrewResult> {
	const cutoff =
		cutoffDate === undefined
			? await getFinanceCutoffDate(supabase)
			: cutoffDate;

	const { data, error } = await supabase
		.from("crew_assignments")
		.select(
			`id, fee_amount, bonus_amount, reimbursement_amount,
			event:events!inner(project_id, client_name, event_date,
				settlement:event_settlements(closed_at)),
			user:users!crew_assignments_user_id_fkey(full_name, nickname)`,
		)
		.eq("is_paid", false);
	if (error) throw new Error(`Fetch unpaid crew: ${error.message}`);

	const rows = (
		(data ?? []) as Array<{
			id: string;
			fee_amount: number | null;
			bonus_amount: number | null;
			reimbursement_amount: number | null;
			event: UnpaidEvent | UnpaidEvent[] | null;
			user:
				| { full_name: string; nickname: string | null }
				| Array<{ full_name: string; nickname: string | null }>
				| null;
		}>
	)
		.map((r) => {
			const ev = Array.isArray(r.event) ? r.event[0] : r.event;
			const u = Array.isArray(r.user) ? r.user[0] : r.user;
			const st = Array.isArray(ev?.settlement)
				? ev?.settlement[0]
				: ev?.settlement;
			return {
				id: r.id,
				amount:
					Number(r.fee_amount ?? 0) +
					Number(r.bonus_amount ?? 0) +
					Number(r.reimbursement_amount ?? 0),
				crewName: u?.nickname?.trim() || u?.full_name || "Crew",
				closedAt: st?.closed_at?.slice(0, 10) ?? null,
				event: ev
					? {
							project_id: ev.project_id,
							client_name: ev.client_name,
							event_date: ev.event_date,
						}
					: null,
			};
		})
		.filter(
			(r) =>
				r.amount > 0 &&
				r.closedAt !== null &&
				(!cutoff || r.closedAt >= cutoff),
		)
		.sort((a, b) => b.amount - a.amount);

	return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
}

export type CrewLiabilityGap = {
	projectId: string;
	clientName: string;
	eventDate: string;
	/** Yang diutangkan jurnal settlement ke akun 2-100. */
	booked: number;
	/** Yang bisa dibayar lewat tombol Bayar (fee + bonus + reimbursement). */
	payable: number;
	/** booked − payable. Positif = ada utang yang tidak tertaut ke crew mana pun. */
	gap: number;
};

/**
 * Kenapa saldo 2-100 beda dari daftar "belum dibayar", dipecah per event.
 *
 * Sebabnya hampir selalu satu: settle mengutangkan seluruh OpEx (fee + biaya
 * lapangan yang ditalangi crew), tapi yang bisa dibayar lewat aplikasi cuma
 * fee + bonus + reimbursement_amount. Talangan yang tidak pernah dimasukkan ke
 * reimbursement mengendap di 2-100 tanpa muncul di layar mana pun.
 *
 * Sejak 2026-08-07 settleEvent menyamakannya otomatis (lihat
 * src/lib/rekap/reimbursement.ts), jadi daftar ini seharusnya hanya berisi
 * event lama. Kalau ada event baru yang muncul di sini, berarti penyamaan itu
 * gagal — bukan sekadar "ada jurnal manual".
 */
export async function listCrewLiabilityGaps(
	supabase: AnySupabase,
): Promise<CrewLiabilityGap[]> {
	const { data: settlements } = await supabase
		.from("event_settlements")
		.select(
			"event_id, event:events!inner(project_id, client_name, event_date)",
		);
	if (!settlements?.length) return [];

	const eventIds = settlements.map((s: { event_id: string }) => s.event_id);

	// Utang yang dibukukan: kredit 2-100 pada jurnal settlement event ini.
	const { data: entries } = await supabase
		.from("journal_entries")
		.select("id, source_event_id")
		.eq("source_type", "settlement")
		.eq("is_reversed", false)
		.in("source_event_id", eventIds);
	const eventByEntry = new Map<string, string>(
		(entries ?? []).map((e: { id: string; source_event_id: string }) => [
			e.id,
			e.source_event_id,
		]),
	);
	const { data: lines } = await supabase
		.from("journal_lines")
		.select("entry_id, credit_amount")
		.eq("account_code", "2-100")
		.in("entry_id", [...eventByEntry.keys()]);
	const bookedByEvent = new Map<string, number>();
	for (const l of (lines ?? []) as Array<{
		entry_id: string;
		credit_amount: number | string;
	}>) {
		const evId = eventByEntry.get(l.entry_id);
		if (!evId) continue;
		bookedByEvent.set(
			evId,
			(bookedByEvent.get(evId) ?? 0) + Number(l.credit_amount ?? 0),
		);
	}

	// Yang bisa dibayar: seluruh assignment event tsb (dibayar maupun belum —
	// pembayaran mendebit 2-100 dengan angka yang sama).
	const { data: assigns } = await supabase
		.from("crew_assignments")
		.select("event_id, fee_amount, bonus_amount, reimbursement_amount")
		.in("event_id", eventIds);
	const payableByEvent = new Map<string, number>();
	for (const a of (assigns ?? []) as Array<{
		event_id: string;
		fee_amount: number | null;
		bonus_amount: number | null;
		reimbursement_amount: number | null;
	}>) {
		payableByEvent.set(
			a.event_id,
			(payableByEvent.get(a.event_id) ?? 0) +
				Number(a.fee_amount ?? 0) +
				Number(a.bonus_amount ?? 0) +
				Number(a.reimbursement_amount ?? 0),
		);
	}

	const out: CrewLiabilityGap[] = [];
	for (const s of settlements as Array<{
		event_id: string;
		event:
			| { project_id: string; client_name: string; event_date: string }
			| Array<{ project_id: string; client_name: string; event_date: string }>
			| null;
	}>) {
		const booked = bookedByEvent.get(s.event_id) ?? 0;
		if (booked <= 0) continue;
		const payable = payableByEvent.get(s.event_id) ?? 0;
		const gap = booked - payable;
		if (Math.abs(gap) < 1) continue;
		const ev = Array.isArray(s.event) ? s.event[0] : s.event;
		out.push({
			projectId: ev?.project_id ?? "",
			clientName: ev?.client_name ?? "",
			eventDate: ev?.event_date ?? "",
			booked,
			payable,
			gap,
		});
	}
	return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}
