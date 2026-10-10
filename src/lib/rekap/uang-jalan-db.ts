import "server-only";

import { saldoUangJalan, type UjRow } from "@/lib/rekap/uang-jalan";

// biome-ignore lint/suspicious/noExplicitAny: klien Supabase server/admin sama-sama dipakai.
type Db = any;

/** Saldo uang jalan (masih dipegang crew) untuk satu acara & crew. */
export async function saldoUangJalanDb(
	db: Db,
	eventId: string,
	userId: string,
): Promise<number> {
	const { data, error } = await db
		.from("uang_jalan")
		.select("kind, amount, is_reversed")
		.eq("event_id", eventId)
		.eq("user_id", userId);
	if (error) throw new Error(`uang_jalan: ${error.message}`);
	return saldoUangJalan((data ?? []) as UjRow[]);
}
