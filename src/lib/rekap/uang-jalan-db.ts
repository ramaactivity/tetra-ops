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

export type TalanganOwnerSaldo = {
	id: string;
	name: string;
	saldo: number;
	/** Bayar/terima terakhir (belum dibatalkan) — untuk tombol batal. */
	riwayat: Array<{
		id: string;
		direction: "bayar" | "terima";
		amount: number;
		created_at: string;
	}>;
};

/**
 * Saldo hutang-piutang Tetra ↔ tiap owner (lihat saldoTalanganOwner). Owner
 * yang saldonya nol tetap tampil 7 hari setelah pembayaran terakhir supaya
 * pelunasan yang salah masih bisa dibatalkan.
 */
export async function loadTalanganOwner(db: Db): Promise<TalanganOwnerSaldo[]> {
	const [uj, bayar, owners] = await Promise.all([
		db
			.from("uang_jalan")
			.select("kind, amount, admin_fee, account_code, owner_id, is_reversed")
			.eq("account_code", TALANGAN_OWNER_COA),
		db
			.from("talangan_owner_bayar")
			.select("id, owner_id, direction, amount, is_reversed, created_at")
			.order("created_at", { ascending: false }),
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
	const pays = (
		(bayar.data ?? []) as Array<
			TalanganBayarRow & { id: string; created_at: string }
		>
	).filter((b) => !b.is_reversed);
	const recent = Date.now() - 7 * 86_400_000;
	return [...saldo.entries()]
		.map(([id, v]) => ({
			id,
			name: nameOf.get(id) ?? "Owner",
			saldo: Math.round(v),
			riwayat: pays
				.filter((b) => b.owner_id === id)
				.slice(0, 5)
				.map((b) => ({
					id: b.id,
					direction: b.direction,
					amount: Number(b.amount),
					created_at: b.created_at,
				})),
		}))
		.filter(
			(o) =>
				o.saldo !== 0 ||
				o.riwayat.some((r) => Date.parse(r.created_at) > recent),
		)
		.sort((a, b) => b.saldo - a.saldo);
}
