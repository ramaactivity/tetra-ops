/**
 * Uang jalan crew (petty cash per acara) — logika murni.
 *
 * Owner memberi uang di muka (1-320 Uang Jalan Crew). Pengeluaran yang dibayar
 * crew tetap jadi reimbursement (2-100) saat settle. Saat fee dibayar, sisa
 * uang jalan dipotong dari transfer: owner cukup transfer fee + reimbursement −
 * uang jalan. Contoh: uang jalan 200rb, terpakai 150rb, fee 150rb → transfer 100rb.
 */

export type UjRow = {
	kind: "beri" | "kembali" | "potong_fee";
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
