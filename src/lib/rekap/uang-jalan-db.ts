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
	/**
	 * Yang belum lunas di sisi saldonya (saldo > 0: hutang Tetra ke owner,
	 * saldo < 0: piutang owner ke Tetra), paling lama dulu.
	 */
	rincian: Array<TalanganItem & { sisa: number }>;
	/** Pelunasan terakhir (bayar/terima, belum dibatalkan) — untuk tombol batal. */
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
				"id, owner_id, direction, amount, is_reversed, created_at, note, event:events(project_id, client_name, event_date), journal:journal_entries(entry_date)",
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
				journal: { entry_date: string } | null;
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
			// H = Tetra berutang ke owner, P = owner berutang ke Tetra. Keduanya
			// saling mengimpas; bayar menutup H, terima menutup P.
			const H: TalanganItem[] = [];
			const P: TalanganItem[] = [];
			let bayar = 0;
			let terima = 0;
			for (const r of ujRows) {
				if (r.owner_id !== id || r.is_reversed) continue;
				const crew = r.crew?.nickname || r.crew?.full_name || "crew";
				if (r.kind === "beri")
					H.push({
						label: `Uang jalan ${crew}${acara(r.event)}`,
						date: tgl(r.created_at, r.event),
						amount: Number(r.amount) + Number(r.admin_fee || 0),
						projectId: r.event?.project_id ?? null,
					});
				else if (r.kind === "kembali")
					P.push({
						label: `Sisa uang jalan ${crew} dipegang owner${acara(r.event)}`,
						date: tgl(r.created_at, r.event),
						amount: Number(r.amount),
						projectId: r.event?.project_id ?? null,
					});
			}
			for (const b of lRows) {
				if (b.owner_id !== id) continue;
				const it = {
					// Keterangan biaya acara sudah memuat nama klien — jangan dobel.
					label: `${b.note || "Catatan"}${
						b.event?.client_name && b.note?.includes(b.event.client_name)
							? ""
							: acara(b.event)
					}`,
					// Sama dengan riwayat: tanggal acara, kalau tidak ada tanggal
					// transaksinya (bukan tanggal input).
					date:
						b.event?.event_date ??
						b.journal?.entry_date ??
						b.created_at.slice(0, 10),
					amount: Number(b.amount),
					projectId: b.event?.project_id ?? null,
					batalId: b.event === null ? b.id : null,
				};
				if (b.direction === "talangan") H.push(it);
				else if (b.direction === "piutang") P.push(it);
				else if (b.direction === "bayar") bayar += Number(b.amount);
				else terima += Number(b.amount);
			}
			const sum = (xs: TalanganItem[]) => xs.reduce((t, x) => t + x.amount, 0);
			const rincian =
				v >= 0
					? rincianTerbuka(H, sum(P) + bayar - terima)
					: rincianTerbuka(P, sum(H) + terima - bayar);
			const pays = lRows.filter(
				(b) =>
					b.owner_id === id &&
					(b.direction === "bayar" || b.direction === "terima"),
			);
			return {
				id,
				name: nameOf.get(id) ?? "Owner",
				saldo: Math.round(v),
				rincian,
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

/** Satu baris riwayat hutang-piutang Tetra ↔ owner. */
export type TalanganRiwayatRow = {
	id: string;
	ownerId: string;
	/** yyyy-mm-dd */
	date: string;
	createdAt: string;
	jenis:
		| "uang_jalan"
		| "sisa_uang_jalan"
		| "talangan"
		| "piutang"
		| "bayar"
		| "terima";
	label: string;
	projectId: string | null;
	/** + = Tetra makin berutang ke owner, − = berkurang / owner berutang. */
	amount: number;
	reversed: boolean;
	/** Saldo owner itu setelah baris ini (baris batal tidak mengubah saldo). */
	saldo: number;
	proofUrl: string | null;
	/** id talangan_owner_bayar yang boleh dibatalkan dari halaman ini. */
	batalId: string | null;
};

/**
 * Riwayat lengkap hutang-piutang owner (semua acara, termasuk yang dibatalkan)
 * dengan saldo berjalan per owner — aturan saldo sama dengan saldoTalanganOwner.
 * Urut terbaru dulu.
 */
export async function loadTalanganRiwayat(
	db: Db,
): Promise<TalanganRiwayatRow[]> {
	const [uj, ledger] = await Promise.all([
		db
			.from("uang_jalan")
			.select(
				"id, kind, amount, admin_fee, owner_id, is_reversed, created_at, proof_url, crew:users!uang_jalan_user_id_fkey(full_name, nickname), event:events(project_id, client_name, event_date)",
			)
			.eq("account_code", TALANGAN_OWNER_COA),
		db
			.from("talangan_owner_bayar")
			.select(
				"id, owner_id, direction, amount, is_reversed, created_at, note, event:events(project_id, client_name, event_date), journal:journal_entries(entry_date, proof_url)",
			),
	]);
	for (const r of [uj, ledger])
		if (r.error) throw new Error(`riwayat talangan: ${r.error.message}`);
	type Ev = EvRef;
	const acara = (ev: Ev) => (ev?.client_name ? ` — ${ev.client_name}` : "");
	const rows: Omit<TalanganRiwayatRow, "saldo">[] = [];
	for (const r of (uj.data ?? []) as Array<{
		id: string;
		kind: string;
		amount: number;
		admin_fee: number | null;
		owner_id: string | null;
		is_reversed: boolean;
		created_at: string;
		proof_url: string | null;
		crew: { full_name: string; nickname: string | null } | null;
		event: Ev;
	}>) {
		if (!r.owner_id || (r.kind !== "beri" && r.kind !== "kembali")) continue;
		const crew = r.crew?.nickname || r.crew?.full_name || "crew";
		const admin = Number(r.admin_fee || 0);
		rows.push({
			id: `uj:${r.id}`,
			ownerId: r.owner_id,
			// Tanggal acara (sama dengan rincian di kartu), kalau tidak ada:
			// tanggal dicatat.
			date: r.event?.event_date ?? r.created_at.slice(0, 10),
			createdAt: r.created_at,
			jenis: r.kind === "beri" ? "uang_jalan" : "sisa_uang_jalan",
			label:
				r.kind === "beri"
					? `Uang jalan ${crew}${acara(r.event)}${admin > 0 ? ` (+ admin ${admin.toLocaleString("id-ID")})` : ""}`
					: `Sisa uang jalan ${crew} dipegang owner${acara(r.event)}`,
			projectId: r.event?.project_id ?? null,
			amount: r.kind === "beri" ? Number(r.amount) + admin : -Number(r.amount),
			reversed: r.is_reversed,
			proofUrl: r.proof_url,
			batalId: null,
		});
	}
	for (const b of (ledger.data ?? []) as Array<{
		id: string;
		owner_id: string;
		direction: TalanganRiwayatRow["jenis"];
		amount: number;
		is_reversed: boolean;
		created_at: string;
		note: string | null;
		event: Ev;
		journal: { entry_date: string; proof_url: string | null } | null;
	}>) {
		const keluar = b.direction === "bayar" || b.direction === "piutang";
		const note = b.note || "";
		rows.push({
			id: b.id,
			ownerId: b.owner_id,
			// Hutang dari acara → tanggal acara (sama dengan rincian); pelunasan &
			// catatan langsung → tanggal transaksinya.
			date:
				(b.direction === "talangan" || b.direction === "piutang") &&
				b.event?.event_date
					? b.event.event_date
					: (b.journal?.entry_date ?? b.created_at.slice(0, 10)),
			createdAt: b.created_at,
			jenis: b.direction,
			label:
				b.direction === "bayar"
					? `Dibayar ke owner${note ? ` — ${note}` : ""}`
					: b.direction === "terima"
						? `Diterima dari owner${note ? ` — ${note}` : ""}`
						: `${note || "Catatan"}${
								b.event?.client_name && note.includes(b.event.client_name)
									? ""
									: acara(b.event)
							}`,
			projectId: b.event?.project_id ?? null,
			amount: (keluar ? -1 : 1) * Number(b.amount),
			reversed: b.is_reversed,
			proofUrl: b.journal?.proof_url ?? null,
			// Catatan dari acara dibatalkan di rekap/jurnal acaranya.
			batalId:
				b.is_reversed ||
				((b.direction === "talangan" || b.direction === "piutang") && b.event)
					? null
					: b.id,
		});
	}
	// Saldo berjalan per owner, kronologis; lalu tampil terbaru dulu.
	rows.sort(
		(a, b) =>
			a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
	);
	const run = new Map<string, number>();
	const out = rows.map((r) => {
		const s = (run.get(r.ownerId) ?? 0) + (r.reversed ? 0 : r.amount);
		run.set(r.ownerId, s);
		return { ...r, saldo: s };
	});
	return out.reverse();
}
