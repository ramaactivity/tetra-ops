import "server-only";

/**
 * Dashboard portal untuk event buatan admin: satu client_bookings "resmi" yang
 * menempel ke event (idempoten per event). Dipakai undangan dari Ops dan
 * dasbor rekanan (semua event vendor otomatis punya dashboard).
 */
import { payerFromCommissionMode, randomCode } from "@/lib/portal/core";
import { createAdminClient } from "@/lib/supabase/admin";

export const EVENT_BOOKING_SELECT =
	"id, project_id, event_title, client_name, event_date, start_time, end_time, service_type, frame_size, unit_count, grand_total, venue_name, venue_address, venue_city, event_category, deleted_at, channel, vendor_name, vendor_commission_mode, package:packages(duration_hours)";

export type EventForBooking = {
	id: string;
	project_id: string;
	event_title: string | null;
	client_name: string | null;
	event_date: string;
	start_time: string | null;
	end_time: string | null;
	service_type: string;
	frame_size: string | null;
	unit_count: number | null;
	grand_total: number | null;
	venue_name: string | null;
	venue_address: string | null;
	venue_city: string | null;
	event_category: string | null;
	channel: string | null;
	vendor_name: string | null;
	vendor_commission_mode: string | null;
	package: unknown;
};

/** Booking portal milik event ini (dibuat kalau belum ada). null = gagal. */
export async function ensureEventBooking(
	ev: EventForBooking,
	createdBy: string,
	opts: { asWo?: boolean; clientName?: string } = {},
): Promise<{ id: string; public_code: string } | null> {
	const admin = createAdminClient();
	const viaVendor = ev.channel === "vendor";
	const payer = viaVendor
		? payerFromCommissionMode(ev.vendor_commission_mode)
		: null;
	let { data: b } = await admin
		.from("client_bookings")
		.select("id, public_code")
		.eq("event_id", ev.id)
		.order("created_at")
		.limit(1)
		.maybeSingle();
	if (!b) {
		// to-one embed → object.
		const pkg = ev.package as { duration_hours: number | null } | null;
		const hours = Math.min(24, Math.max(1, Number(pkg?.duration_hours ?? 2)));
		const now = new Date();
		for (let attempt = 0; attempt < 3 && !b; attempt++) {
			const { data, error } = await admin
				.from("client_bookings")
				.insert({
					public_code: randomCode(6),
					status: "resmi",
					service_type: ev.service_type,
					package_hours: hours,
					frame_size: ev.frame_size,
					unit_count: Math.min(3, Math.max(1, Number(ev.unit_count ?? 1))),
					quoted_total: Number(ev.grand_total ?? 0),
					event_date: ev.event_date,
					start_time: ev.start_time,
					end_time: ev.end_time,
					venue_city: ev.venue_city,
					event_id: ev.id,
					managed_by: opts.asWo || viaVendor ? "wo" : "klien",
					channel: viaVendor ? "vendor" : "direct",
					payer,
					detail: {
						nama_acara: ev.event_title || ev.client_name || "",
						...(viaVendor && ev.vendor_name ? { wo_nama: ev.vendor_name } : {}),
						...(opts.clientName ? { pemilik_nama: opts.clientName } : {}),
						...(ev.venue_name ? { venue_nama: ev.venue_name } : {}),
						...(ev.venue_address ? { venue_alamat: ev.venue_address } : {}),
						...(ev.venue_city ? { venue_kota: ev.venue_city } : {}),
						...(ev.event_category ? { kategori: ev.event_category } : {}),
					},
					// Undangan admin: persetujuan PDP dicatat saat undangan; klien tetap
					// melihat kebijakan privasi di portal (terms_version menandai sumbernya).
					pdp_consent_at: now.toISOString(),
					terms_version: "undangan-admin",
					expires_at: new Date(now.getTime() + 365 * 86_400_000).toISOString(),
					created_by_person: createdBy,
				})
				.select("id, public_code")
				.single();
			if (error?.code === "23505") continue;
			if (error) return null;
			b = data;
		}
		if (!b) return null;
	}
	if (payer)
		await admin
			.from("client_bookings")
			.update({ payer })
			.eq("id", b.id)
			.is("payer", null);
	return b;
}
