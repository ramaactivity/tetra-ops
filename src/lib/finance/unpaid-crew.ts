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
