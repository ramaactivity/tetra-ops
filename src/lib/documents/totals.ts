import type { DocItem } from "./types";

export type DocTotals = {
	subtotal: number;
	discount: number;
	/** Nilai dasar setelah diskon (yang harus diterima Tetra). */
	net: number;
	grossUp: number;
	total: number;
};

/**
 * Gross-up PPh: klien memotong r% dari tagihan, jadi tagihan dinaikkan supaya
 * setelah dipotong Tetra tetap menerima `net`.
 *   total = net / (1 − r)   →   grossUp = total − net
 */
export function computeTotals(
	items: ReadonlyArray<Pick<DocItem, "qty" | "unit_price">>,
	discount: number,
	grossUp: { enabled: boolean; ratePct: number },
): DocTotals {
	const subtotal = items.reduce(
		(s, it) => s + Math.max(0, Math.round(it.qty * it.unit_price)),
		0,
	);
	const disc = Math.min(Math.max(0, Math.round(discount)), subtotal);
	const net = subtotal - disc;
	const r = grossUp.enabled
		? Math.min(Math.max(grossUp.ratePct, 0), 99) / 100
		: 0;
	const total = r > 0 ? Math.round(net / (1 - r)) : net;
	return { subtotal, discount: disc, net, grossUp: total - net, total };
}
