/**
 * Pembagian untung event saat settle (aturan Rama, 29 Sep 2026).
 *
 * Dasar = untung bersih event SETELAH pengeluaran/pemasukan lain (bukan
 * untung settlement mentah) — dibatasi maksimal untung settlement supaya
 * jurnal settle tetap seimbang.
 *
 * Urutan saat untung tidak cukup:
 *   1. Dana cadangan dikurangi seperlunya (sisa setelah bagi hasil owner,
 *      dibagi ke dana sesuai urutan display_order). Alasannya: uang belanja
 *      sudah diambil dari HPP; dana cadangan hanya tabungan tambahan.
 *   2. Kalau untung bahkan kurang dari total bagi hasil owner → bagi hasil
 *      dihapus penuh (dana cadangan tetap 0); untung yang ada masuk kas usaha.
 *
 * WAJIB identik dengan langkah 7–9 settle_event_impl
 * (supabase/migrations/20260929_profit_waterfall.sql).
 */

export type SinkingFundRule = {
	code: string;
	allocation_type: "percentage" | "flat" | string;
	allocation_value: number;
	display_order?: number | null;
};

export type AllocationStatus =
	/** Semua dapat penuh. */
	| "penuh"
	/** Bagi hasil penuh, dana cadangan dikurangi. */
	| "cadangan_dikurangi"
	/** Untung < bagi hasil owner (atau tidak untung) → tidak ada pembagian. */
	| "tanpa_pembagian";

export type ProfitAllocation = {
	available: number;
	sinking: Array<{ code: string; target: number; amount: number }>;
	sinkingTarget: number;
	sinkingTotal: number;
	ownerPoolTarget: number;
	ownerPool: number;
	/** available − dana cadangan − bagi hasil (≥ 0 kecuali available < 0). */
	sisaKas: number;
	status: AllocationStatus;
};

export function allocateProfit(params: {
	available: number;
	funds: SinkingFundRule[];
	ownerCount: number;
	perPerson: number;
}): ProfitAllocation {
	const available = Math.round(params.available);
	const ordered = [...params.funds].sort(
		(a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
	);
	const targetOf = (f: SinkingFundRule) =>
		f.allocation_type === "percentage"
			? Math.floor((Math.max(0, available) * f.allocation_value) / 100)
			: Math.round(f.allocation_value);
	const sinkingTarget = ordered.reduce((s, f) => s + targetOf(f), 0);
	const ownerPoolTarget = params.ownerCount * params.perPerson;

	if (available <= 0 || available < ownerPoolTarget) {
		return {
			available,
			sinking: ordered.map((f) => ({
				code: f.code,
				target: targetOf(f),
				amount: 0,
			})),
			sinkingTarget,
			sinkingTotal: 0,
			ownerPoolTarget,
			ownerPool: 0,
			sisaKas: available,
			status: "tanpa_pembagian",
		};
	}

	let room = available - ownerPoolTarget;
	const sinking = ordered.map((f) => {
		const target = targetOf(f);
		const amount = Math.max(0, Math.min(target, room));
		room -= amount;
		return { code: f.code, target, amount };
	});
	const sinkingTotal = sinking.reduce((s, x) => s + x.amount, 0);
	return {
		available,
		sinking,
		sinkingTarget,
		sinkingTotal,
		ownerPoolTarget,
		ownerPool: ownerPoolTarget,
		sisaKas: available - sinkingTotal - ownerPoolTarget,
		status: sinkingTotal < sinkingTarget ? "cadangan_dikurangi" : "penuh",
	};
}

/** Dasar pembagian: untung settle − pengeluaran lain + pemasukan lain, ≤ untung settle. */
export function allocationBase(netProfit: number, extraNet: number): number {
	return Math.min(netProfit, netProfit - extraNet);
}
