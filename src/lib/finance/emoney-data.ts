/**
 * Pemuatan kartu e-money + saldo live.
 *
 * Saldo TIDAK disimpan sebagai kolom — sama seperti rekening bank, ia dihitung
 * dari jurnal. Dengan begitu mustahil ada dua versi angka yang berbeda antara
 * halaman kartu, Neraca, dan penjaga saldo.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllJournalLines } from "./balance-guard";

// biome-ignore lint/suspicious/noExplicitAny: sama seperti balance-guard.ts
type AnySupabase = SupabaseClient<any, any, any>;

export type EmoneyCard = {
	id: string;
	name: string;
	provider: string | null;
	holderNote: string | null;
	coaCode: string;
	balance: number;
	lowThreshold: number;
	/** Saldo di bawah batas yang diset owner. false kalau batasnya 0 (mati). */
	isLow: boolean;
	isActive: boolean;
};

type CardRow = {
	id: string;
	account_name: string;
	card_provider: string | null;
	holder_note: string | null;
	coa_code: string;
	low_balance_threshold: number | string | null;
	is_active: boolean;
};

/**
 * Kartu e-money beserta saldonya. Default hanya yang aktif — kartu hilang atau
 * kadaluwarsa tidak boleh muncul di pemilih pembayar, tapi saldonya tetap ada
 * di buku sampai dinolkan.
 */
export async function loadEmoneyCards(
	supabase: AnySupabase,
	opts?: { includeInactive?: boolean },
): Promise<EmoneyCard[]> {
	let query = supabase
		.from("bank_accounts")
		.select(
			"id, account_name, card_provider, holder_note, coa_code, low_balance_threshold, is_active",
		)
		.eq("account_kind", "emoney")
		.order("coa_code", { ascending: true });

	if (!opts?.includeInactive) query = query.eq("is_active", true);

	const { data: rows, error } = await query;
	if (error || !rows || rows.length === 0) return [];

	const cards = rows as CardRow[];
	const wanted = new Set(cards.map((c) => c.coa_code));

	const lines = await fetchAllJournalLines<{
		account_code: string;
		debit_amount: number | string;
		credit_amount: number | string;
	}>(supabase, "account_code, debit_amount, credit_amount");

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

	return cards.map((c) => {
		const balance = balances.get(c.coa_code) ?? 0;
		const lowThreshold = Number(c.low_balance_threshold ?? 0) || 0;
		return {
			id: c.id,
			name: c.account_name,
			provider: c.card_provider,
			holderNote: c.holder_note,
			coaCode: c.coa_code,
			balance,
			lowThreshold,
			isLow: lowThreshold > 0 && balance < lowThreshold,
			isActive: c.is_active,
		};
	});
}

/**
 * Bentuk ringkas untuk pemilih pembayar di rekap.
 *
 * `balance` sengaja opsional: crew tidak diberi angka saldo (aturan "crew tidak
 * pernah melihat angka keuangan"), tapi tetap diberi tanda `isLow` supaya tahu
 * kartu mana yang perlu diisi sebelum berangkat.
 */
export type PayerCardOption = {
	id: string;
	name: string;
	balance?: number;
	isLow: boolean;
};

export function toPayerOptions(
	cards: EmoneyCard[],
	opts: { withBalance: boolean },
): PayerCardOption[] {
	return cards.map((c) => ({
		id: c.id,
		name: c.name,
		balance: opts.withBalance ? c.balance : undefined,
		isLow: c.isLow,
	}));
}
