import "server-only";

import {
	saldoTalanganOwner,
	saldoUangJalan,
	TALANGAN_OWNER_COA,
	type TalanganBayarRow,
	type TalanganRow,
	type UjRow,
} from "@/lib/rekap/uang-jalan";

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

export type TalanganOwnerSaldo = { id: string; name: string; saldo: number };

/**
 * Saldo hutang-piutang Tetra ↔ tiap owner (lihat saldoTalanganOwner). Hanya
 * owner yang saldonya tidak nol.
 */
export async function loadTalanganOwner(db: Db): Promise<TalanganOwnerSaldo[]> {
	const [uj, bayar, owners] = await Promise.all([
		db
			.from("uang_jalan")
			.select("kind, amount, account_code, owner_id, is_reversed")
			.eq("account_code", TALANGAN_OWNER_COA),
		db
			.from("talangan_owner_bayar")
			.select("owner_id, direction, amount, is_reversed"),
		db.from("users").select("id, full_name, nickname"),
	]);
	for (const r of [uj, bayar, owners])
		if (r.error) throw new Error(`talangan owner: ${r.error.message}`);
	const saldo = saldoTalanganOwner(
		(uj.data ?? []) as TalanganRow[],
		(bayar.data ?? []) as TalanganBayarRow[],
	);
	const nameOf = new Map(
		(
			(owners.data ?? []) as Array<{
				id: string;
				full_name: string;
				nickname: string | null;
			}>
		).map((u) => [u.id, u.nickname || u.full_name]),
	);
	return [...saldo.entries()]
		.filter(([, v]) => Math.round(v) !== 0)
		.map(([id, v]) => ({ id, name: nameOf.get(id) ?? "Owner", saldo: v }))
		.sort((a, b) => b.saldo - a.saldo);
}
