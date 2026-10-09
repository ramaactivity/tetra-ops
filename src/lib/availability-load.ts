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
 * Muat semua yang menahan unit lalu hitung ketersediaan. Dipakai
 * /api/availability (bot WA) dan booking publik, supaya keduanya memakai
 * aturan yang sama.
 *
 * Yang menahan unit:
 *   - events selain cancelled/archived (termasuk draft — Keputusan #1 tim bot)
 *   - booking_inbox baru/diproses (klien sudah DP lewat bot, event belum dibuat)
 *   - client_bookings menunggu_konfirmasi (DP portal menunggu dicek admin).
 *     Draf portal TIDAK menahan unit (DR-026).
 * Tanggal H-1 ikut dimuat karena buffer bisa melewati tengah malam.
 */
const NON_LOCKING_STATUSES = new Set(["cancelled", "archived"]);

type Dated = { date: string; ev: AvailabilityEvent };

const shift = (iso: string, n: number) => {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
};

/** Semua pemegang unit pada rentang [from, to] (inklusif). */
async function loadLocking(
	supabase: SupabaseClient,
	from: string,
	to: string,
	excludeBookingId?: string,
): Promise<Dated[]> {
	const [evRes, inboxRes, portalRes] = await Promise.all([
		supabase
			.from("events")
			.select(
				"event_date, client_name, start_time, end_time, session_segments, venue_city, status, unit_count, package:packages(duration_hours)",
			)
			.gte("event_date", from)
			.lte("event_date", to)
			.is("deleted_at", null)
			// Guest Cam tanpa booth tidak memakai unit booth.
			.or("service_type.is.null,service_type.neq.guest_cam"),
		supabase
			.from("booking_inbox")
			.select("client_name, data")
			.in("status", ["baru", "diproses"])
			.gte("data->>tanggal_iso", from)
			.lte("data->>tanggal_iso", to),
		supabase
			.from("client_bookings")
			.select(
				"id, event_date, start_time, end_time, venue_city, unit_count, package_hours",
			)
			.eq("status", "menunggu_konfirmasi")
			.eq("is_demo", false)
			.neq("service_type", "guest_cam")
			.gte("event_date", from)
			.lte("event_date", to),
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
	const out: Dated[] = ((evRes.data ?? []) as unknown as Row[])
		.filter((r) => !NON_LOCKING_STATUSES.has(r.status ?? ""))
		.map((r) => ({
			date: r.event_date,
			ev: {
				client_name: r.client_name,
				start_time: r.start_time,
				end_time: r.end_time,
				session_segments: r.session_segments,
				venue_city: r.venue_city,
				package_duration_hours: r.package?.duration_hours ?? null,
				units: r.unit_count ?? 1,
			},
		}));
	for (const it of (inboxRes.data ?? []) as Array<{
		client_name: string | null;
		data: InboxData;
	}>)
		out.push({
			date: it.data.tanggal_iso ?? "",
			ev: inboxToAvailabilityEvent(it),
		});
	for (const b of portalRes.data ?? []) {
		if (b.id === excludeBookingId) continue;
		out.push({
			date: b.event_date,
			ev: {
				client_name: "Booking portal (DP dicek)",
				start_time: b.start_time,
				end_time: b.end_time,
				venue_city: b.venue_city,
				package_duration_hours: b.package_hours,
				units: b.unit_count,
			},
		});
	}
	return out;
}

/** Event tanggal itu + H-1 (digeser −1440 menit) untuk computeAvailability. */
function eventsFor(all: Dated[], date: string): AvailabilityEvent[] {
	const prev = shift(date, -1);
	return all
		.filter((x) => x.date === date || x.date === prev)
		.map((x) => ({ ...x.ev, day_offset_min: x.date === prev ? -1440 : 0 }));
}

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
	const all = await loadLocking(
		supabase,
		shift(q.date, -1),
		q.date,
		q.excludeBookingId,
	);
	return computeAvailability({
		reqStart: q.reqStart,
		reqEnd: q.reqEnd,
		reqCity: q.city,
		events: eventsFor(all, q.date),
	});
}

/**
 * Tanggal di [from, to] yang sudah TIDAK cukup untuk `units` unit sepanjang
 * hari (dicek 00:00–23:59, sama dengan aturan bot saat jam belum pasti).
 * Satu kali baca DB untuk sebulan kalender.
 */
export async function loadFullDates(
	supabase: SupabaseClient,
	q: { from: string; to: string; units: number; city: string | null },
): Promise<string[]> {
	const all = await loadLocking(supabase, shift(q.from, -1), q.to);
	const full: string[] = [];
	for (let d = q.from; d <= q.to; d = shift(d, 1)) {
		const events = eventsFor(all, d);
		if (events.length === 0) continue;
		const r = computeAvailability({
			reqStart: 0,
			reqEnd: 24 * 60 - 1,
			reqCity: q.city,
			events,
		});
		if (r.units_free < q.units) full.push(d);
	}
	return full;
}
