/**
 * Daftar rekening kas/bank + saldo live — untuk pemilih "Uang diambil dari"
 * di setiap alur uang keluar (bayar hutang, bayar fee crew, pembelian, tambah
 * item). Tanpa ini alur pembelian diam-diam memotong 1-100 Kas Tunai, padahal
 * uangnya keluar dari bank (kasus saldo Kas Tunai minus).
 *
 * Saldo dihitung sekali jalan dari journal_lines (paginated) — bukan satu
 * query per rekening seperti pemanggil lama.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCashOrBank } from "./accounting";
import { fetchAllJournalLines } from "./balance-guard";

// biome-ignore lint/suspicious/noExplicitAny: sama seperti balance-guard.ts
type AnySupabase = SupabaseClient<any, any, any>;

export type CashAccountOption = {
	code: string;
	name: string;
	/** Saldo live (debit − credit). */
	balance: number;
};

export async function loadCashAccounts(
	supabase: AnySupabase,
): Promise<CashAccountOption[]> {
	const [{ data: coa }, lines] = await Promise.all([
		supabase
			.from("chart_of_accounts")
			.select("code, name, account_type")
			.eq("is_active", true)
			.order("code"),
		fetchAllJournalLines<{
			account_code: string;
			debit_amount: number | string;
			credit_amount: number | string;
		}>(supabase, "account_code, debit_amount, credit_amount"),
	]);

	const cash = (
		(coa ?? []) as Array<{
			code: string;
			name: string;
			account_type: string;
		}>
	).filter((c) => isCashOrBank(c.code, c.account_type));
	const wanted = new Set(cash.map((c) => c.code));

	const balances = new Map<string, number>();
	for (const l of lines) {
		if (!wanted.has(l.account_code)) continue;
		balances.set(
			l.account_code,
			(balances.get(l.account_code) ?? 0) +
				Number(l.debit_amount) -
				Number(l.credit_amount),
		);
	}

	return cash.map((c) => ({
		code: c.code,
		name: c.name,
		balance: balances.get(c.code) ?? 0,
	}));
}

/**
 * Rekening default untuk sejumlah uang keluar: yang saldonya cukup lebih dulu,
 * baru rekening pertama. Jangan asal index 0 — itu yang bikin kas tunai minus.
 */
export function defaultCashAccount(
	accounts: CashAccountOption[],
	amount: number,
): string {
	return (
		accounts.find((a) => a.balance >= amount)?.code ??
		accounts[0]?.code ??
		"1-100"
	);
}
