/**
 * Server-side data loader for the "Catat" quick-record launcher. Called from
 * the Finance + Akuntansi server pages and passed into the client launcher.
 *
 * Returns the cash/bank accounts with their live balances (for the source
 * picker + running-balance reassurance), the full active COA (for the "Akun
 * lain…" power-user escape), and a short list of recent manual transactions
 * (for one-tap repeat). Plain async server function — not a server action.
 */

import {
	aggregateBalances,
	type CoaMeta,
	isCashOrBank,
	type LineForBalance,
} from "@/lib/finance/accounting";
import {
	type CatatDirection,
	categoryByCoa,
} from "@/lib/finance/quick-record-categories";
import { createClient } from "@/lib/supabase/server";

export type CashAccount = { code: string; name: string; balance: number };
export type CoaOption = { code: string; name: string; account_type: string };
export type RecentTxn = {
	id: string;
	direction: CatatDirection;
	amount: number;
	accountCode: string;
	counterpartCode: string;
	categoryId: string | null;
	label: string;
};

export type CatatData = {
	cashAccounts: CashAccount[];
	coaOptions: CoaOption[];
	recents: RecentTxn[];
};

const ENTRY_TYPE_TO_DIRECTION: Record<string, CatatDirection> = {
	expense: "keluar",
	revenue: "masuk",
	transfer: "transfer",
};

export async function loadCatatData(): Promise<CatatData> {
	const supabase = await createClient();

	const [{ data: coa }, { data: lineData }, { data: rawRecents }] =
		await Promise.all([
			supabase
				.from("chart_of_accounts")
				.select("code, name, account_type, is_active")
				.eq("is_active", true)
				.order("code"),
			supabase
				.from("journal_lines")
				.select("account_code, debit_amount, credit_amount"),
			supabase
				.from("journal_entries")
				.select(
					`id, entry_type, total_amount, description,
					 lines:journal_lines(account_code, debit_amount, credit_amount)`,
				)
				.eq("source_type", "manual")
				.in("entry_type", ["expense", "revenue", "transfer"])
				.order("created_at", { ascending: false })
				.limit(8),
		]);

	const coaBase = (coa ?? []) as Array<{
		code: string;
		name: string;
		account_type: string;
	}>;

	const allLines: LineForBalance[] = (
		(lineData ?? []) as Array<{
			account_code: string;
			debit_amount: number | string;
			credit_amount: number | string;
		}>
	).map((l) => ({
		account_code: l.account_code,
		debit_amount: Number(l.debit_amount),
		credit_amount: Number(l.credit_amount),
	}));

	const coaMeta: CoaMeta[] = coaBase.map((c) => ({
		code: c.code,
		name: c.name,
		account_type: c.account_type,
	}));
	const balanceByCode = new Map(
		aggregateBalances(coaMeta, allLines).map((a) => [a.code, a.balance]),
	);

	const cashAccounts: CashAccount[] = coaBase
		.filter((c) => isCashOrBank(c.code, c.account_type))
		.map((c) => ({
			code: c.code,
			name: c.name,
			balance: balanceByCode.get(c.code) ?? 0,
		}));

	// Postable, non-header accounts for the "Akun lain…" combobox.
	const coaOptions: CoaOption[] = coaBase
		.filter((c) => c.code.includes("-") && !c.code.endsWith("-000"))
		.map((c) => ({ code: c.code, name: c.name, account_type: c.account_type }));

	const recents: RecentTxn[] = (
		(rawRecents ?? []) as Array<{
			id: string;
			entry_type: string;
			total_amount: number | string;
			description: string;
			lines: Array<{
				account_code: string;
				debit_amount: number | string;
				credit_amount: number | string;
			}> | null;
		}>
	)
		.map((r): RecentTxn | null => {
			const lines = r.lines ?? [];
			if (lines.length !== 2) return null;
			const acctType = (code: string) =>
				coaBase.find((c) => c.code === code)?.account_type ?? "";
			const cashLine = lines.find((l) =>
				isCashOrBank(l.account_code, acctType(l.account_code)),
			);
			const counterpart = lines.find((l) => l !== cashLine) ?? null;
			if (!cashLine || !counterpart) return null;
			const direction = ENTRY_TYPE_TO_DIRECTION[r.entry_type] ?? "keluar";
			const cat = categoryByCoa(counterpart.account_code);
			return {
				id: r.id,
				direction,
				amount: Number(r.total_amount),
				accountCode: cashLine.account_code,
				counterpartCode: counterpart.account_code,
				categoryId: cat?.id ?? null,
				label: cat?.label ?? r.description,
			};
		})
		.filter((r): r is RecentTxn => r !== null)
		.slice(0, 4);

	return { cashAccounts, coaOptions, recents };
}
