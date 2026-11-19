import type {
	BookingFormDefaults,
	PackageOption,
} from "@/components/booking/booking-form";
import { formatPhoneLocal } from "@/lib/format";
import { computeTotals } from "./totals";
import { type DocumentRow, dealVendorCut } from "./types";

/**
 * "10:00–14:00" / "10.00 - 14.00" → ["10:00", "14:00"]; jam tunggal
 * "18:00" → ["18:00", ""] (jam selesai diturunkan form dari durasi paket).
 */
export function parseTimeRange(
	raw: string | null | undefined,
): [string, string] {
	const pad = (h: string, mm: string) => `${h.padStart(2, "0")}:${mm}`;
	const m = /(\d{1,2})[:.](\d{2})\s*[–\-—]\s*(\d{1,2})[:.](\d{2})/.exec(
		raw ?? "",
	);
	if (m) return [pad(m[1], m[2]), pad(m[3], m[4])];
	const one = /(\d{1,2})[:.](\d{2})/.exec(raw ?? "");
	return one ? [pad(one[1], one[2]), ""] : ["", ""];
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
	// Format cetak belum dipilih → item paket tanpa package_id ("Photobooth
	// Classic Unlimited 2 Jam"). Harga sama untuk semua ukuran (Rama 19 Nov),
	// jadi durasi + harga tetap terbawa; ukuran menyusul.
	const classicItem = pkgItem
		? undefined
		: q.items.find((i) =>
				/^Photobooth Classic Unlimited (\d+) Jam/i.test(i.name),
			);
	const classicHours = classicItem
		? Number(/(\d+) Jam/i.exec(classicItem.name)?.[1] ?? 0)
		: 0;
	const svcItem = pkgItem ?? classicItem;
	const [start, end] = parseTimeRange(q.event_info.time);
	const totals = computeTotals(q.items, q.discount, {
		enabled: q.gross_up_enabled,
		ratePct: q.gross_up_rate,
	});
	const org = q.client.org?.trim();
	// Rincian kesepakatan dari editor dokumen (isian sama dengan form booking).
	// documents.discount = diskon klien + potongan langsung vendor → di event
	// keduanya terpisah lagi (discount_amount vs vendor_commission_*).
	const deal = q.deal;
	const vendor = deal?.channel === "vendor";
	const vendorCut = dealVendorCut(deal, q.items);

	return {
		channel: vendor ? "vendor" : "direct",
		...(vendor
			? {
					vendor_name: deal.vendor_name ?? "",
					vendor_pic_name: deal.vendor_pic_name ?? "",
					vendor_contact: deal.vendor_contact ?? "",
					vendor_commission_mode: deal.vendor_commission_mode ?? "commission",
					vendor_commission_value_type:
						deal.vendor_commission_value_type ?? "percent",
					vendor_commission_value: deal.vendor_commission_value ?? 0,
				}
			: {}),
		discount_type: deal?.discount_type ?? "",
		// Form merangkai judul event sendiri dari klien + nama acara.
		client_org: org || q.client.name,
		event_title: q.event_info.title ?? "",
		booker_name: q.client.attn || (org ? q.client.name : ""),
		client_wa: q.client.phone ? formatPhoneLocal(q.client.phone) : "",
		client_email: q.client.email ?? "",
		// Tipe acara belum diketahui dari quotation — tebakan aman yang bisa
		// diganti di form: ada instansi/perusahaan → corporate, selain itu event.
		event_category: org ? "corporate" : "event",
		service_type: pkg?.category ?? (classicItem ? "photobooth_classic" : ""),
		package_id: pkg?.id ?? "",
		pending_package_hours: classicHours || "",
		frame_size: pkg?.frame_size ?? "",
		// Qty paket di quotation = jumlah unit/booth (event multi-unit, maks 3).
		unit_count: svcItem ? Math.min(3, Math.max(1, svcItem.qty)) : 1,
		base_price: svcItem ? svcItem.unit_price * svcItem.qty : 0,
		event_date: q.event_info.date ?? "",
		// Invoice DP membawa jatuh tempo yang sudah disepakati.
		due_date: q.due_date ?? "",
		start_time: start,
		end_time: end,
		venue_name: q.event_info.venue ?? "",
		venue_city: q.event_info.city ?? "",
		addons: q.items
			.filter((i) => i.addon_id)
			// Harga ikut quotation (bisa beda dari master: break time, banner
			// ukuran lain) — dulu hilang saat deal, total booking ≠ quotation.
			.map((i) => ({
				addon_id: i.addon_id as string,
				quantity: i.qty,
				unit_price: i.unit_price,
			})),
		discount_amount: Math.max(0, q.discount - vendorCut),
		gross_up_pph_amount: totals.grossUp,
		// crew_notes sengaja kosong: dulu diisi "Dari quotation <nomor>" dan
		// tampil ke crew sebagai "Catatan untuk crew" (ikut briefing H-1).
	};
}
