import type { BookingFormDefaults } from "@/components/booking/booking-form";

/**
 * Satu-satunya pemetaan "baris event → isian form Edit booking". Dipakai
 * halaman Edit booking dan agent MCP (revisi_event), supaya revisi dari agent
 * = menyimpan form Edit booking dengan beberapa kolom diganti — bukan jalur
 * tulis kedua.
 */
export const BOOKING_EDIT_SELECT = `id, project_id, channel, client_name, client_org, event_title, client_wa, client_email, unit_count, spots,
	service_type, package_id, pending_package_hours, frame_size,
	event_category, event_date,
	event_date_is_estimate, due_date,
	setup_time, start_time, end_time, session_segments,
	booker_name,
	venue_name, venue_address, venue_city, venue_province, google_maps_url,
	vendor_name, vendor_pic_name, vendor_contact,
	vendor_commission_mode, vendor_commission_value_type, vendor_commission_value,
	vendor_commission_rate, vendor_commission_amount,
	referrer_user_id, referrer_type, referrer_commission,
	sales_user_id, direct_sales_commission,
	pic_name, pic_wa, extra_pics, bill_to_mode,
	backdrop_id, vendor_decor_markup, include_flashdisk_pouch, guest_card_design,
	base_price, discount_amount, discount_type, gross_up_pph_amount, crew_notes,
	event_addons(addon_id, quantity, unit_price, addon:addons(price)),
	event_bonuses(addon_id, quantity, notes)`;

const trimTime = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

// biome-ignore lint/suspicious/noExplicitAny: baris Supabase tanpa tipe generik
export function bookingDefaultsFromEvent(event: any): BookingFormDefaults {
	return {
		channel: event.channel,
		client_name: event.client_name,
		client_org: event.client_org ?? "",
		event_title: event.event_title ?? "",
		client_wa: event.client_wa,
		client_email: event.client_email ?? "",
		service_type: event.service_type,
		package_id: event.package_id ?? "",
		pending_package_hours: event.pending_package_hours ?? "",
		frame_size: event.frame_size,
		event_category: event.event_category,
		event_date: event.event_date,
		event_date_is_estimate: event.event_date_is_estimate ? "on" : "",
		due_date: (event.due_date as string | null) ?? "",
		setup_time: trimTime(event.setup_time),
		start_time: trimTime(event.start_time),
		end_time: trimTime(event.end_time),
		session_segments: event.session_segments
			? JSON.stringify(event.session_segments)
			: "",
		booker_name: event.booker_name ?? "",
		venue_name: event.venue_name ?? "",
		venue_address: event.venue_address ?? "",
		venue_city: event.venue_city ?? "",
		venue_province: event.venue_province ?? "",
		google_maps_url: event.google_maps_url ?? "",
		vendor_name: event.vendor_name ?? "",
		vendor_pic_name: event.vendor_pic_name ?? "",
		vendor_contact: event.vendor_contact ?? "",
		vendor_commission_mode:
			(event.vendor_commission_mode as "commission" | "upfront_cut" | null) ??
			"commission",
		vendor_commission_value_type:
			(event.vendor_commission_value_type as "percent" | "flat" | null) ??
			"percent",
		vendor_commission_value:
			(event.vendor_commission_value as number | null) ??
			(event.vendor_commission_rate as number | null) ??
			0,
		vendor_commission_rate: event.vendor_commission_rate ?? 10,
		vendor_commission_amount: event.vendor_commission_amount ?? 0,
		referrer_user_id: event.referrer_user_id ?? "",
		referrer_type: event.referrer_type ?? "",
		referrer_commission: event.referrer_commission ?? 0,
		sales_user_id: event.sales_user_id ?? "",
		direct_sales_commission: event.direct_sales_commission ?? 0,
		pic_name: event.pic_name ?? "",
		pic_wa: event.pic_wa ?? "",
		extra_pics: JSON.stringify(event.extra_pics ?? []),
		bill_to_mode: event.bill_to_mode ?? "",
		// Dulu tidak dipetakan → tiap Edit booking menghapus tipe diskon.
		discount_type: event.discount_type ?? "",
		backdrop_id: event.backdrop_id ?? "",
		unit_count: (event.unit_count as number | null) ?? 1,
		spots: JSON.stringify(event.spots ?? []),
		vendor_decor_markup: event.vendor_decor_markup ?? 0,
		guest_card_design: event.guest_card_design ?? "",
		include_flashdisk_pouch: event.include_flashdisk_pouch ?? true,
		base_price: event.base_price ?? 0,
		discount_amount: event.discount_amount ?? 0,
		gross_up_pph_amount: event.gross_up_pph_amount ?? 0,
		crew_notes: event.crew_notes ?? "",
		addons: (
			(event.event_addons ?? []) as Array<{
				addon_id: string;
				quantity: number;
				unit_price: number | null;
				addon: { price: number } | Array<{ price: number }> | null;
			}>
		).map((a) => {
			// Harga yang tersimpan beda dari master (kesepakatan / master
			// berubah sejak booking) → dipertahankan saat booking diedit.
			const master = Array.isArray(a.addon)
				? a.addon[0]?.price
				: a.addon?.price;
			const saved = Number(a.unit_price ?? 0);
			return saved > 0 && saved !== Number(master)
				? { addon_id: a.addon_id, quantity: a.quantity, unit_price: saved }
				: { addon_id: a.addon_id, quantity: a.quantity };
		}),
		bonuses: (
			(event.event_bonuses ?? []) as Array<{
				addon_id: string;
				quantity: number;
				notes: string | null;
			}>
		).map((b) => ({
			addon_id: b.addon_id,
			quantity: b.quantity,
			notes: b.notes,
		})),
	};
}

/** Isian form → FormData persis seperti yang dikirim BookingForm saat submit. */
export function bookingFormData(d: BookingFormDefaults): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(d)) {
		if (k === "addons" || k === "bonuses" || v === null || v === undefined)
			continue;
		if (k === "include_flashdisk_pouch") {
			if (v) fd.set(k, "on");
			continue;
		}
		fd.set(k, String(v));
	}
	fd.set("addons_json", JSON.stringify(d.addons ?? []));
	fd.set("bonuses_json", JSON.stringify(d.bonuses ?? []));
	return fd;
}
