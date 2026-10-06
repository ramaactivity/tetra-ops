import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
	type AvailabilityEvent,
	type AvailabilityResult,
	computeAvailability,
	inboxToAvailabilityEvent,
} from "@/lib/availability";
import type { InboxData } from "@/lib/booking-inbox/core";

/**
 * Muat semua yang menahan unit di tanggal itu (dan H-1, karena buffer bisa
 * melewati tengah malam) lalu hitung ketersediaan. Dipakai /api/availability
 * (bot WA) dan booking publik, supaya keduanya memakai aturan yang sama.
 *
 * Yang menahan unit:
 *   - events selain cancelled/archived (termasuk draft — Keputusan #1 tim bot)
 *   - booking_inbox baru/diproses (klien sudah DP lewat bot, event belum dibuat)
 *   - client_bookings menunggu_konfirmasi (DP portal menunggu dicek admin).
 *     Draf portal TIDAK menahan unit (DR-026).
 */
const NON_LOCKING_STATUSES = new Set(["cancelled", "archived"]);

export async function loadAvailability(
	supabase: SupabaseClient,
	q: {
		date: string;
		reqStart: number;
		reqEnd: number;
		city: string | null;
		/** Booking portal yang sedang dicek — jangan dihitung menahan dirinya sendiri. */
		excludeBookingId?: string;
	},
): Promise<AvailabilityResult> {
	const prevDate = (() => {
		const d = new Date(`${q.date}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() - 1);
		return d.toISOString().slice(0, 10);
	})();
	const offset = (d: string) => (d === prevDate ? -1440 : 0);

	const [evRes, inboxRes, portalRes] = await Promise.all([
		supabase
			.from("events")
			.select(
				"event_date, client_name, start_time, end_time, session_segments, venue_city, status, unit_count, package:packages(duration_hours)",
			)
			.in("event_date", [prevDate, q.date])
			.is("deleted_at", null),
		supabase
			.from("booking_inbox")
			.select("client_name, data")
			.in("status", ["baru", "diproses"])
			.in("data->>tanggal_iso", [prevDate, q.date]),
		supabase
			.from("client_bookings")
			.select(
				"id, event_date, start_time, end_time, venue_city, unit_count, package_hours",
			)
			.eq("status", "menunggu_konfirmasi")
			.in("event_date", [prevDate, q.date]),
	]);
	const err = evRes.error ?? inboxRes.error ?? portalRes.error;
	if (err) throw new Error(err.message);

	type Row = {
		event_date: string;
		client_name: string | null;
		start_time: string | null;
		end_time: string | null;
		session_segments: unknown;
		venue_city: string | null;
		status: string | null;
		unit_count: number | null;
		// to-one embed → object (atau null), bukan array.
		package: { duration_hours: number | null } | null;
	};
	const events: AvailabilityEvent[] = ((evRes.data ?? []) as unknown as Row[])
		.filter((r) => !NON_LOCKING_STATUSES.has(r.status ?? ""))
		.map((r) => ({
			client_name: r.client_name,
			start_time: r.start_time,
			end_time: r.end_time,
			session_segments: r.session_segments,
			venue_city: r.venue_city,
			package_duration_hours: r.package?.duration_hours ?? null,
			day_offset_min: offset(r.event_date),
			units: r.unit_count ?? 1,
		}));

	for (const it of (inboxRes.data ?? []) as Array<{
		client_name: string | null;
		data: InboxData;
	}>) {
		events.push({
			...inboxToAvailabilityEvent(it),
			day_offset_min: offset(it.data.tanggal_iso ?? ""),
		});
	}

	for (const b of portalRes.data ?? []) {
		if (b.id === q.excludeBookingId) continue;
		events.push({
			client_name: "Booking portal (DP dicek)",
			start_time: b.start_time,
			end_time: b.end_time,
			venue_city: b.venue_city,
			package_duration_hours: b.package_hours,
			day_offset_min: offset(b.event_date),
			units: b.unit_count,
		});
	}

	return computeAvailability({
		reqStart: q.reqStart,
		reqEnd: q.reqEnd,
		reqCity: q.city,
		events,
	});
}
