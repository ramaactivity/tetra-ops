import "server-only";

import {
	rincianTerbuka,
	saldoTalanganOwner,
	saldoUangJalan,
	TALANGAN_OWNER_COA,
	type TalanganBayarRow,
	type TalanganItem,
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
	/** Yang belum lunas (Tetra berutang ke owner), paling lama dulu. */
	rincian: Array<TalanganItem & { sisa: number }>;
	/** Bayar/terima terakhir (belum dibatalkan) — untuk tombol batal. */
	riwayat: Array<{
		id: string;
		direction: "bayar" | "terima";
		amount: number;
		created_at: string;
		note: string | null;
	}>;
};

type EvRef = {
	project_id: string;
	client_name: string | null;
	event_date: string | null;
} | null;

/**
 * Hutang-piutang Tetra ↔ tiap owner (lihat saldoTalanganOwner) + rinciannya:
 * uang jalan dari uang pribadi & pengeluaran event yang dibayar owner dulu.
 * Owner yang saldonya nol tetap tampil 7 hari setelah pembayaran terakhir
 * supaya pelunasan yang salah masih bisa dibatalkan.
 */
export async function loadTalanganOwner(db: Db): Promise<TalanganOwnerSaldo[]> {
	const [uj, ledger, owners] = await Promise.all([
		db
			.from("uang_jalan")
			.select(
				"kind, amount, admin_fee, account_code, owner_id, is_reversed, created_at, crew:users!uang_jalan_user_id_fkey(full_name, nickname), event:events(project_id, client_name, event_date)",
			)
			.eq("account_code", TALANGAN_OWNER_COA),
		db
			.from("talangan_owner_bayar")
			.select(
				"id, owner_id, direction, amount, is_reversed, created_at, note, event:events(project_id, client_name, event_date)",
			)
			.order("created_at", { ascending: false }),
		db.from("users").select("id, full_name, nickname"),
	]);
	for (const r of [uj, ledger, owners])
		if (r.error) throw new Error(`talangan owner: ${r.error.message}`);
	const ujRows = (uj.data ?? []) as Array<
		TalanganRow & {
			created_at: string;
			crew: { full_name: string; nickname: string | null } | null;
			event: EvRef;
		}
	>;
	const lRows = (
		(ledger.data ?? []) as Array<
			TalanganBayarRow & {
				id: string;
				created_at: string;
				note: string | null;
				event: EvRef;
			}
		>
	).filter((b) => !b.is_reversed);
	const saldo = saldoTalanganOwner(ujRows, lRows);
	const nameOf = new Map(
		(
			(owners.data ?? []) as Array<{
				id: string;
				full_name: string;
				nickname: string | null;
			}>
		).map((u) => [u.id, u.nickname || u.full_name]),
	);
	const tgl = (iso: string, ev: EvRef) => ev?.event_date ?? iso.slice(0, 10);
	const acara = (ev: EvRef) => (ev?.client_name ? ` — ${ev.client_name}` : "");
	const recent = Date.now() - 7 * 86_400_000;
	return [...saldo.entries()]
		.map(([id, v]) => {
			const items: TalanganItem[] = [];
			let kredit = 0;
			for (const r of ujRows) {
				if (r.owner_id !== id || r.is_reversed) continue;
				if (r.kind === "beri")
					items.push({
						label: `Uang jalan ${r.crew?.nickname || r.crew?.full_name || "crew"}${acara(r.event)}`,
						date: tgl(r.created_at, r.event),
						amount: Number(r.amount) + Number(r.admin_fee || 0),
						projectId: r.event?.project_id ?? null,
					});
				else if (r.kind === "kembali") kredit += Number(r.amount);
			}
			for (const b of lRows) {
				if (b.owner_id !== id) continue;
				if (b.direction === "talangan")
					items.push({
						label: `${b.note || "Pengeluaran"}${acara(b.event)}`,
						date: tgl(b.created_at, b.event),
						amount: Number(b.amount),
						projectId: b.event?.project_id ?? null,
					});
				else kredit += (b.direction === "bayar" ? 1 : -1) * Number(b.amount);
			}
			const pays = lRows.filter(
				(b) => b.owner_id === id && b.direction !== "talangan",
			);
			return {
				id,
				name: nameOf.get(id) ?? "Owner",
				saldo: Math.round(v),
				rincian: rincianTerbuka(items, kredit),
				riwayat: pays.slice(0, 5).map((b) => ({
					id: b.id,
					direction: b.direction as "bayar" | "terima",
					amount: Number(b.amount),
					created_at: b.created_at,
					note: b.note,
				})),
			};
		})
		.filter(
			(o) =>
				o.saldo !== 0 ||
				o.riwayat.some((r) => Date.parse(r.created_at) > recent),
		)
		.sort((a, b) => b.saldo - a.saldo);
}
