import type {
	BookingFormDefaults,
	PackageOption,
} from "@/components/booking/booking-form";
import { computeTotals } from "./totals";
import type { DocumentRow } from "./types";

/** "10:00–14:00" / "10.00 - 14.00" → ["10:00", "14:00"]; selain itu kosong. */
function parseTimeRange(raw: string | null | undefined): [string, string] {
	const m = /(\d{1,2})[:.](\d{2})\s*[–\-—]\s*(\d{1,2})[:.](\d{2})/.exec(
		raw ?? "",
	);
	if (!m) return ["", ""];
	const pad = (h: string, mm: string) => `${h.padStart(2, "0")}:${mm}`;
	return [pad(m[1], m[2]), pad(m[3], m[4])];
}

/**
 * Isi awal form booking dari quotation yang di-deal. Paket & add-on dipetakan
 * lewat package_id/addon_id yang disimpan di item; harga ikut angka quotation
 * (yang disepakati klien), bukan harga master hari ini.
 */
export function quotationToBookingDefaults(
	q: DocumentRow,
	packages: PackageOption[],
): BookingFormDefaults {
	const pkgItem = q.items.find((i) => i.package_id);
	const pkg = pkgItem
		? packages.find((p) => p.id === pkgItem.package_id)
		: undefined;
	const [start, end] = parseTimeRange(q.event_info.time);
	const totals = computeTotals(q.items, q.discount, {
		enabled: q.gross_up_enabled,
		ratePct: q.gross_up_rate,
	});
	const org = q.client.org?.trim();

	return {
		channel: "direct",
		client_name: org ? `${org} — ${q.client.name}` : q.client.name,
		booker_name: q.client.name,
		client_wa: q.client.phone ?? "",
		client_email: q.client.email ?? "",
		// Tipe acara belum diketahui dari quotation — tebakan aman yang bisa
		// diganti di form: ada instansi/perusahaan → corporate, selain itu event.
		event_category: org ? "corporate" : "event",
		service_type: pkg?.category ?? "",
		package_id: pkg?.id ?? "",
		frame_size: pkg?.frame_size ?? "",
		base_price: pkgItem ? pkgItem.unit_price : 0,
		event_date: q.event_info.date ?? "",
		start_time: start,
		end_time: end,
		venue_name: q.event_info.venue ?? "",
		venue_city: q.event_info.city ?? "",
		addons: q.items
			.filter((i) => i.addon_id)
			.map((i) => ({ addon_id: i.addon_id as string, quantity: i.qty })),
		discount_amount: q.discount,
		gross_up_pph_amount: totals.grossUp,
		crew_notes: `Dari quotation ${q.doc_number}`,
	};
}
