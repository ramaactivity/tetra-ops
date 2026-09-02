import "server-only";

import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export type SinkingFundOption = { id: string; name: string; balance: number };

/**
 * Dana cadangan aktif + saldonya, untuk pilihan "pakai dana cadangan" di
 * dialog Catat Pembelian.
 *
 * Dana bersaldo 0 sengaja disaring: menawarkannya cuma bikin owner memilih
 * lalu ditolak penjaga saldo di server.
 */
export async function loadSinkingFundOptions(
	supabase: ServerSupabase,
): Promise<SinkingFundOption[]> {
	const [{ data: funds }, { data: balances }] = await Promise.all([
		supabase
			.from("sinking_funds")
			.select("id, name")
			.eq("is_active", true)
			.order("display_order", { ascending: true }),
		supabase.rpc("get_sinking_fund_balances"),
	]);

	const byId = new Map(
		((balances ?? []) as Array<{ fund_id: string; balance: number }>).map(
			(b) => [b.fund_id, Number(b.balance)],
		),
	);

	return ((funds ?? []) as Array<{ id: string; name: string }>)
		.map((f) => ({ id: f.id, name: f.name, balance: byId.get(f.id) ?? 0 }))
		.filter((f) => f.balance > 0);
}
