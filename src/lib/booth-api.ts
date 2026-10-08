/**
 * API baca-saja untuk Tetra Booth (booth.tetraphoto.com): wizard "Buat event" di sana menarik booking & paket
 * dari sini supaya nama, tanggal, lokasi, ukuran frame, dan durasi paket tidak diketik ulang.
 *
 * Hanya field NON-finansial: tanpa harga, pembayaran, nomor WA, atau kontak. Auth: `Authorization: Bearer
 * ${BOOTH_API_TOKEN}` (lihat isAuthorizedBooth di bot-auth.ts). Modul polos supaya bisa dites tanpa server.
 */
import { createHmac } from "node:crypto";
import { shiftISODate } from "@/lib/dates";
import { GUEST_CAM } from "@/lib/portal/core";

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

// ── Kontrak v0.4 §2.2: field tambahan (aditif) ──────────────────────────────

export type BoothModule =
	| "photobooth"
	| "photo_stage"
	| "guest_cam"
	| "videobooth_360"
	| "magazine";

/** Isi paket dari kategorinya + Guest Cam kalau add-on/bonus Guest Cam dipesan. */
export function modulesFor(
	serviceType: string | null,
	addonNames: string[] = [],
): BoothModule[] {
	const base = modulesOfPackage(serviceType);
	return addonNames.some((n) => GUEST_CAM.includes(n))
		? [...base, "guest_cam"]
		: base;
}

function modulesOfPackage(serviceType: string | null): BoothModule[] {
	switch (serviceType) {
		case "photobooth_classic":
			return ["photobooth"];
		case "videobooth_360":
			return ["videobooth_360"];
		case "magazine_combo":
			return ["magazine", "photobooth"];
		case "magazine_box_only":
			return ["magazine"];
		case "photostage_only":
			return ["photo_stage"];
		case "photostage_combo":
			return ["photo_stage", "photobooth"];
		default:
			return [];
	}
}

/** Satu permintaan desain portal + versi yang di-ACC + template Booth (kalau ada). */
export type DesignSource = {
	spot_no: number;
	stage: string;
	version: {
		frame_size: string;
		orientation: string;
		file_path: string;
		booth_layout_id: string | null;
	} | null;
	template: {
		booth_layout_id: string | null;
		booth_preset_id: string | null;
	} | null;
};

export type BoothDesignSpot = {
	spot_no: number;
	frame_size: string | null;
	orientation: string | null;
	frame_url: string | null;
	booth_layout_id: string | null;
	booth_preset_id: string | null;
};

export type BoothDesign = {
	status: string;
	stage: string | null;
	approved_at: string | null;
	frame_size: string | null;
	orientation: string | null;
	frame_url: string | null;
	frame_url_expires_at: string | null;
	booth_layout_id: string | null;
	booth_preset_id: string | null;
	spots: BoothDesignSpot[];
};

/**
 * Objek `design` kontrak §2.2. frame_url hanya untuk desain yang sudah approved
 * (signed URL berumur pendek; `urlFor` disuntik supaya fungsi ini murni).
 */
export function toBoothDesign(
	ev: {
		design_status: string | null;
		design_approved_at: string | null;
		design_frame_size: string | null;
		frame_size: string | null;
	},
	reqs: DesignSource[],
	urlFor: (path: string) => string | null,
	expiresAt: string | null,
): BoothDesign {
	const approved = ev.design_status === "approved";
	const spot = (r: DesignSource | undefined): BoothDesignSpot => ({
		spot_no: r?.spot_no ?? 1,
		frame_size: r?.version?.frame_size ?? null,
		orientation: r?.version?.orientation ?? null,
		frame_url:
			approved && r?.stage === "acc" && r.version
				? urlFor(r.version.file_path)
				: null,
		booth_layout_id:
			r?.version?.booth_layout_id ?? r?.template?.booth_layout_id ?? null,
		booth_preset_id: r?.template?.booth_preset_id ?? null,
	});
	const s1 = spot(reqs.find((r) => r.spot_no === 1));
	return {
		status: ev.design_status ?? "belum",
		stage: reqs.find((r) => r.spot_no === 1)?.stage ?? null,
		approved_at: ev.design_approved_at,
		frame_size: s1.frame_size ?? ev.design_frame_size ?? ev.frame_size,
		orientation: s1.orientation,
		frame_url: s1.frame_url,
		frame_url_expires_at: s1.frame_url ? expiresAt : null,
		booth_layout_id: s1.booth_layout_id,
		booth_preset_id: s1.booth_preset_id,
		spots: reqs
			.filter((r) => r.spot_no > 1)
			.sort((a, b) => a.spot_no - b.spot_no)
			.map(spot),
	};
}

/** Header X-Tetra-Signature (§4.1): HMAC-SHA256(secret, "<t>.<body>") dalam hex. */
export function boothSignature(
	secret: string,
	t: number,
	body: string,
): string {
	return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}
