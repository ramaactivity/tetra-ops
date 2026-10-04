/**
 * API baca-saja untuk Tetra Booth (booth.tetraphoto.com): wizard "Buat event" di sana menarik booking & paket
 * dari sini supaya nama, tanggal, lokasi, ukuran frame, dan durasi paket tidak diketik ulang.
 *
 * Hanya field NON-finansial: tanpa harga, pembayaran, nomor WA, atau kontak. Auth: `Authorization: Bearer
 * ${BOOTH_API_TOKEN}` (lihat isAuthorizedBooth di bot-auth.ts). Modul polos supaya bisa dites tanpa server.
 */
import { shiftISODate } from "@/lib/dates";

/** Booking yang masih akan / sedang berjalan (termasuk status lama draft/confirmed). */
export const BOOTH_EVENT_STATUSES = [
	"draft",
	"confirmed",
	"upcoming",
	"in_progress",
] as const;

/** Rentang bawaan & maksimum (hari) untuk GET /api/booth/bookings. */
export const BOOTH_RANGE_DEFAULT_DAYS = 60;
export const BOOTH_RANGE_MAX_DAYS = 180;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `from`/`to` dari query → rentang sah, atau pesan error. Kosong = hari ini (WIB) s.d. +60 hari. */
export function parseBoothRange(
	fromRaw: string | null,
	toRaw: string | null,
	today: string,
): { from: string; to: string } | { error: string } {
	const from = fromRaw?.trim() || today;
	const to = toRaw?.trim() || shiftISODate(from, BOOTH_RANGE_DEFAULT_DAYS);
	if (!ISO_DATE.test(from) || !ISO_DATE.test(to))
		return { error: "Param `from`/`to` format YYYY-MM-DD." };
	if (to < from) return { error: "`to` harus sama atau setelah `from`." };
	if (to > shiftISODate(from, BOOTH_RANGE_MAX_DAYS))
		return { error: `Rentang maksimal ${BOOTH_RANGE_MAX_DAYS} hari.` };
	return { from, to };
}

export type BoothEventRow = {
	project_id: string;
	client_name: string | null;
	event_title: string | null;
	event_category: string | null;
	event_date: string;
	start_time: string | null;
	end_time: string | null;
	venue_name: string | null;
	venue_city: string | null;
	service_type: string | null;
	frame_size: string | null;
	custom_package_name: string | null;
	// to-one embed → OBJECT saat runtime (reference_postgrest_to_one_embed); array di tipe PostgREST.
	package:
		| { name: string | null; duration_hours: number | null }
		| Array<{ name: string | null; duration_hours: number | null }>
		| null;
	event_type: { label: string | null } | Array<{ label: string | null }> | null;
};

export type BoothBooking = {
	project_id: string;
	client_name: string | null;
	event_title: string | null;
	event_category: string | null;
	event_category_label: string | null;
	event_date: string;
	start_time: string | null;
	end_time: string | null;
	venue_name: string | null;
	venue_city: string | null;
	service_type: string | null;
	frame_size: string | null;
	package_name: string | null;
	package_duration_hours: number | null;
};

const one = <T>(v: T | T[] | null): T | null =>
	Array.isArray(v) ? (v[0] ?? null) : v;
/** "14:00:00" → "14:00". */
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Baris DB → bentuk publik. Field yang tidak ada di sini (harga, kontak, catatan internal) tidak pernah keluar. */
export function toBoothBooking(r: BoothEventRow): BoothBooking {
	const pkg = one(r.package);
	return {
		project_id: r.project_id,
		client_name: r.client_name,
		event_title: r.event_title,
		event_category: r.event_category,
		event_category_label: one(r.event_type)?.label ?? null,
		event_date: r.event_date,
		start_time: hhmm(r.start_time),
		end_time: hhmm(r.end_time),
		venue_name: r.venue_name,
		venue_city: r.venue_city,
		service_type: r.service_type,
		frame_size: r.frame_size,
		package_name: pkg?.name ?? r.custom_package_name ?? null,
		package_duration_hours: pkg?.duration_hours ?? null,
	};
}

/** Kolom yang dibaca dari `events` — sengaja tanpa kolom uang/kontak. */
export const BOOTH_EVENT_SELECT =
	"project_id, client_name, event_title, event_category, event_date, start_time, end_time, venue_name, venue_city, service_type, frame_size, custom_package_name, package:packages(name, duration_hours), event_type:event_types(label)";
