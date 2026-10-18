/**
 * Uang jalan crew (petty cash per acara) — logika murni.
 *
 * Owner memberi uang di muka (1-320 Uang Jalan Crew). Pengeluaran yang dibayar
 * crew tetap jadi reimbursement (2-100) saat settle. Saat fee dibayar, sisa
 * uang jalan dipotong dari transfer: owner cukup transfer fee + reimbursement −
 * uang jalan. Contoh: uang jalan 200rb, terpakai 150rb, fee 150rb → transfer 100rb.
 */

export type UjRow = {
	kind: "beri" | "kembali" | "potong_fee" | "pakai";
	amount: number;
	is_reversed?: boolean;
};

/** Uang jalan yang masih dipegang crew (belum dikembalikan / dipotong). */
export function saldoUangJalan(rows: UjRow[]): number {
	return rows
		.filter((r) => !r.is_reversed)
		.reduce(
			(s, r) => s + (r.kind === "beri" ? 1 : -1) * Number(r.amount || 0),
			0,
		);
}

/**
 * Berapa yang dipotong dari pembayaran fee (Cr 1-320).
 * - Bawaan: seluruh saldo, maksimal sebesar yang dibayar.
 * - Crew memilih mengembalikan sisa: yang dipotong hanya bagian yang memang
 *   terpakai (= reimbursement); sisanya ditunggu kembali lewat "Terima sisa".
 */
export function potongFee(input: {
	saldo: number;
	total: number;
	reimbursement: number;
	sisa: "potong_fee" | "kembalikan" | null;
}): number {
	const saldo = Math.max(0, input.saldo);
	const bisa =
		input.sisa === "kembalikan"
			? Math.min(saldo, Math.max(0, input.reimbursement))
			: saldo;
	return Math.max(0, Math.min(bisa, input.total));
}

/** Ringkasan untuk crew di form rekap. */
export function ringkasUangJalan(terima: number, dipakai: number) {
	const t = Math.max(0, terima);
	const d = Math.max(0, dipakai);
	return {
		terima: t,
		dipakai: d,
		sisa: Math.max(0, t - d),
		kurang: Math.max(0, d - t),
	};
}

/** Akun utang perusahaan ke owner yang memberi uang jalan dari uang pribadi. */
export const TALANGAN_OWNER_COA = "2-310";

export type TalanganRow = {
	kind: string;
	amount: number;
	account_code: string | null;
	owner_id: string | null;
	is_reversed?: boolean;
	/** Biaya admin transfer yang ikut dibayar owner dari uang pribadinya. */
	admin_fee?: number | null;
};

export type TalanganBayarRow = {
	owner_id: string;
	/** talangan = pengeluaran event yang dibayar owner dulu (Tetra berutang). */
	direction: "bayar" | "terima" | "talangan";
	amount: number;
	is_reversed?: boolean;
};

/**
 * Saldo hutang-piutang Tetra ↔ owner, per owner. Positif = Tetra berutang ke
 * owner (uang pribadinya dipakai uang jalan), negatif = owner berutang ke Tetra
 * (mis. sisa uang jalan dikembalikan crew ke owner melebihi talangannya).
 */
export function saldoTalanganOwner(
	uj: TalanganRow[],
	bayar: TalanganBayarRow[] = [],
): Map<string, number> {
	const out = new Map<string, number>();
	const add = (o: string, v: number) => out.set(o, (out.get(o) ?? 0) + v);
	for (const r of uj) {
		if (r.account_code !== TALANGAN_OWNER_COA || !r.owner_id || r.is_reversed)
			continue;
		if (r.kind === "beri")
			add(r.owner_id, Number(r.amount || 0) + Number(r.admin_fee || 0));
		else if (r.kind === "kembali") add(r.owner_id, -Number(r.amount || 0));
	}
	for (const b of bayar) {
		if (b.is_reversed) continue;
		add(b.owner_id, (b.direction === "bayar" ? -1 : 1) * Number(b.amount || 0));
	}
	return out;
}

/** Satu pemberi di form Catat uang jalan (uang jalan bisa dibagi beberapa owner). */
export type GiverRow = {
	ownerId: string;
	amount: string;
	/** Sudah diketik owner — tidak ditimpa isi otomatis. */
	touched: boolean;
	pribadi: boolean;
	admin: number;
	/** Bukti transfer dari owner ini (tiap owner transfer sendiri). */
	proof?: string | null;
};

/**
 * Isi otomatis sisa laporan crew ke satu-satunya baris yang belum diketik:
 * Rama 75rb diketik, Adit otomatis 30rb kalau crew lapor terima 105rb.
 */
export function isiSisa<T extends { amount: string; touched: boolean }>(
	rows: T[],
	target: number,
): T[] {
	const auto = rows.filter((r) => !r.touched);
	if (target <= 0 || auto.length !== 1) return rows;
	const rest =
		target -
		rows
			.filter((r) => r.touched)
			.reduce((t, r) => t + (Number(r.amount) || 0), 0);
	return rows.map((r) =>
		r.touched ? r : { ...r, amount: rest > 0 ? String(rest) : "" },
	);
}

/** Satu hal yang ditalangi owner (uang jalan / pengeluaran event). */
export type TalanganItem = {
	label: string;
	/** yyyy-mm-dd — urutan pelunasan (paling lama dulu). */
	date: string;
	amount: number;
	projectId?: string | null;
};

/**
 * Item yang belum lunas: pembayaran (+ sisa uang jalan yang dikembalikan ke
 * owner) melunasi item paling lama dulu.
 */
export function rincianTerbuka(
	items: TalanganItem[],
	sudahDibayar: number,
): Array<TalanganItem & { sisa: number }> {
	let kredit = Math.max(0, sudahDibayar);
	const out: Array<TalanganItem & { sisa: number }> = [];
	for (const it of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
		const pakai = Math.min(kredit, it.amount);
		kredit -= pakai;
		if (it.amount - pakai > 0) out.push({ ...it, sisa: it.amount - pakai });
	}
	return out;
}

const tglPendek = (d: string) =>
	new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
	});

/** Label satu item: "16 Okt · Bensin — CIMB Niaga" (tanggal di depan supaya tak terpotong). */
export const labelItem = (it: TalanganItem) =>
	`${tglPendek(it.date)} · ${it.label}`;

/**
 * Keterangan pelunasan: item mana saja yang tertutup oleh `jumlah`, paling lama
 * dulu. Contoh: "16 Okt · Bensin — CIMB 100.000; 16 Okt · Konsumsi — CIMB 20.000 sebagian".
 */
export function uraiPelunasan(
	terbuka: Array<TalanganItem & { sisa: number }>,
	jumlah: number,
): string {
	let sisa = Math.max(0, jumlah);
	const parts: string[] = [];
	for (const it of terbuka) {
		if (sisa <= 0) break;
		const pakai = Math.min(sisa, it.sisa);
		sisa -= pakai;
		parts.push(
			`${labelItem(it)} ${pakai.toLocaleString("id-ID")}${pakai < it.sisa ? " sebagian" : ""}`,
		);
	}
	return parts.join("; ");
}
