/**
 * Tagihan efektif satu event — satu rumus untuk guard pembayaran
 * (checkPayment) dan fakta tagihan bot WA (/api/bot/klien). Potongan langsung
 * vendor (upfront_cut) dipotong di muka.
 */
export type EventTagihan = {
	grand_total: number | string | null;
	total_paid: number | string | null;
	vendor_commission_mode?: string | null;
	vendor_commission_amount?: number | string | null;
};

export function tagihanEvent(ev: EventTagihan) {
	const grand = Number(ev.grand_total) || 0;
	const vendorCut =
		ev.vendor_commission_mode === "upfront_cut"
			? Number(ev.vendor_commission_amount) || 0
			: 0;
	const billable = Math.max(0, grand - vendorCut);
	const terbayar = Number(ev.total_paid) || 0;
	return { billable, terbayar, sisa: Math.max(0, billable - terbayar) };
}
