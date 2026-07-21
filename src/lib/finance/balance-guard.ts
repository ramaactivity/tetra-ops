/**
 * Server-side saldo guard for money-out flows (bayar fee crew, bayar hutang
 * vendor, catat uang keluar/transfer). Satu sumber kebenaran: saldo kas/bank
 * dihitung langsung dari journal_lines (debit − credit, asset debit-normal),
 * lalu dibandingkan dengan uang yang mau keluar. Kalau kurang → tolak dengan
 * pesan owner-readable, supaya rekening tidak pernah minus (kasus Kas Tunai
 * −383rb: dua fee crew terposting ke rekening default yang saldonya Rp0).
 *
 * Manual journal (Jurnal manual) sengaja TIDAK di-guard — itu pintu koreksi
 * power-user, termasuk koreksi yang justru membetulkan saldo minus.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRupiah } from "@/lib/format";

// Loose client type so this helper works with both the SSR server client and
// the service-role client (same pattern as project-demand.ts / forecast.ts).
// biome-ignore lint/suspicious/noExplicitAny: intentional loose typing
type AnySupabase = SupabaseClient<any, any, any>;

const PAGE = 1000;

/**
 * Lifetime saldo (debit − credit) satu akun kas/bank dari journal_lines.
 * Paginated — PostgREST caps a single select at 1000 rows, dan tanpa .range()
 * saldo akun ramai akan diam-diam kekurangan baris.
 */
export async function getCashAccountBalance(
	supabase: AnySupabase,
	accountCode: string,
): Promise<number> {
	let balance = 0;
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await supabase
			.from("journal_lines")
			.select("debit_amount, credit_amount")
			.eq("account_code", accountCode)
			.range(from, from + PAGE - 1);
		if (error) throw new Error(error.message);
		const rows = (data ?? []) as Array<{
			debit_amount: number | string;
			credit_amount: number | string;
		}>;
		for (const l of rows) {
			balance += Number(l.debit_amount) - Number(l.credit_amount);
		}
		if (rows.length < PAGE) break;
	}
	return balance;
}

/**
 * Ambil SELURUH baris journal_lines dengan paginasi.
 *
 * Kenapa perlu: `.select(...)` tanpa `.range()` diam-diam terpotong di batas
 * `db-max-rows` PostgREST (default Supabase 1000). Untuk permukaan yang
 * MENJUMLAHKAN seluruh buku besar — Bagan Akun, Neraca, Laba-Rugi, Trial
 * Balance, panel Rekonsiliasi — pemotongan diam-diam berarti neraca tidak
 * balance dan cron rekonsiliasi meneriakkan drift di hampir semua akun, tanpa
 * satu pun petunjuk bahwa datanya terpotong.
 *
 * `columns` dioper apa adanya supaya pemanggil tetap bisa menyertakan embed
 * (mis. entry_date/is_reversed untuk laporan berperiode).
 */
export async function fetchAllJournalLines<T>(
	supabase: AnySupabase,
	columns: string,
	// biome-ignore lint/suspicious/noExplicitAny: rantai builder PostgREST terlalu
	// dalam untuk di-infer; pemanggil hanya menambah filter seperti .or()/.eq().
	refine?: (q: any) => any,
): Promise<T[]> {
	const out: T[] = [];
	for (let from = 0; ; from += PAGE) {
		// biome-ignore lint/suspicious/noExplicitAny: idem
		let q: any = supabase.from("journal_lines").select(columns);
		if (refine) q = refine(q);
		const { data, error } = await q.range(from, from + PAGE - 1);
		if (error) throw new Error(`Gagal membaca journal_lines: ${error.message}`);
		const rows = (data ?? []) as unknown as T[];
		out.push(...rows);
		if (rows.length < PAGE) break;
	}
	return out;
}

/**
 * Cek saldo cukup untuk `amountOut` keluar dari `accountCode`.
 * Return null kalau cukup; kalau kurang, return pesan error siap-tampil.
 */
export async function insufficientBalanceError(
	supabase: AnySupabase,
	accountCode: string,
	accountName: string,
	amountOut: number,
): Promise<string | null> {
	const balance = await getCashAccountBalance(supabase, accountCode);
	if (balance >= amountOut) return null;
	return `Saldo ${accountName} tidak cukup — saldo ${formatRupiah(balance)}, mau keluar ${formatRupiah(amountOut)}. Pilih rekening lain atau isi dulu saldonya.`;
}
