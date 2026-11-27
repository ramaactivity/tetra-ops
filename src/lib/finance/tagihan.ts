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

type InvoiceDoc = {
	doc_number: string;
	issued_at: string;
	discount?: number | string | null;
	items?:
		| { name: string; includes?: string[]; qty: number; unit_price: number }[]
		| null;
};

/**
 * Rincian invoice terakhir untuk fakta bot WA (Yessi 26 Nov: bot hanya tahu
 * total Rp 2.300.000, tidak tahu "Break Time" sudah masuk invoice, lalu
 * menjanjikan ulang "nominal jeda dihitung admin").
 */
export function rincianInvoice(doc: InvoiceDoc | null | undefined) {
	if (!doc) return null;
	return {
		invoice: doc.doc_number,
		tanggal: doc.issued_at,
		item: (doc.items ?? []).map((i) => ({
			nama: [i.name, ...(i.includes ?? [])].join(" · "),
			qty: Number(i.qty) || 1,
			subtotal: (Number(i.unit_price) || 0) * (Number(i.qty) || 1),
		})),
		diskon: Number(doc.discount) || 0,
	};
}
