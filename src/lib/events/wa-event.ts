/**
 * Satu jalur untuk mengubah baris `events` (plus embed-nya) menjadi `EventForWA`
 * — objek yang dipakai semua pesan WhatsApp: template ke klien maupun reminder
 * assignment ke crew.
 *
 * Kenapa dipusatkan: sebelumnya tiap halaman merakit objek ini dengan tangan,
 * dan halaman detail Operations lupa mengoper `google_maps_url` + PIC → pesan WA
 * ke crew berangkat tanpa link maps & nomor PIC padahal datanya ada di database.
 * Selama pemanggil memakai `WA_EVENT_SELECT`, field baru cukup ditambah di sini.
 *
 * Modul polos (bukan "use server") supaya bisa diimpor server component mana pun.
 */

import type { EventForWA } from "@/lib/whatsapp";

/**
 * Kolom + embed minimum yang dibutuhkan `toEventForWA`. Halaman boleh menambah
 * kolom lain untuk kebutuhannya sendiri, tapi JANGAN mengurangi yang di sini.
 */
export const WA_EVENT_SELECT = `
	project_id, client_name, client_wa, event_date, event_date_is_estimate,
	setup_time, start_time, end_time, session_segments,
	venue_name, venue_address, venue_city, venue_province, google_maps_url,
	pic_name, pic_wa, channel, vendor_name, vendor_pic_name, vendor_contact,
	frame_size, backdrop_id, backdrop_color, custom_package_name,
	pending_package_hours, include_flashdisk_pouch, crew_notes,
	total_paid, remaining_balance,
	pic_contact:contacts!events_pic_contact_id_fkey(name, phone),
	package:packages(name, duration_hours, frame_size),
	backdrop:backdrops(name, type),
	event_addons(quantity, addon:addons(name, unit)),
	event_bonuses(quantity, notes, addon:addons(name, unit))
` as const;

/** PostgREST kadang mengembalikan embed sebagai objek, kadang array. */
type Embed<T> = T | T[] | null | undefined;

const one = <T>(v: Embed<T>): T | null =>
	(Array.isArray(v) ? (v[0] ?? null) : (v ?? null)) as T | null;

type AddonEmbed = Embed<{ name: string; unit: string | null }>;

export type WaEventRow = {
	project_id: string;
	client_name: string;
	client_wa?: string | null;
	event_date: string;
	event_date_is_estimate?: boolean | null;
	setup_time?: string | null;
	start_time?: string | null;
	end_time?: string | null;
	session_segments?: unknown;
	venue_name?: string | null;
	venue_address?: string | null;
	venue_city?: string | null;
	venue_province?: string | null;
	google_maps_url?: string | null;
	pic_name?: string | null;
	pic_wa?: string | null;
	channel?: string | null;
	vendor_name?: string | null;
	vendor_pic_name?: string | null;
	vendor_contact?: string | null;
	frame_size?: string | null;
	backdrop_id?: string | null;
	backdrop_color?: string | null;
	custom_package_name?: string | null;
	pending_package_hours?: number | null;
	include_flashdisk_pouch?: boolean | null;
	crew_notes?: string | null;
	due_date?: string | null;
	total_paid?: number | null;
	remaining_balance?: number | null;
	pic_contact?: Embed<{ name: string | null; phone: string | null }>;
	package?: Embed<{
		name: string | null;
		duration_hours: number | null;
		frame_size?: string | null;
	}>;
	backdrop?: Embed<{ name: string | null; type: string | null }>;
	event_addons?: Array<{ quantity: number; addon: AddonEmbed }> | null;
	event_bonuses?: Array<{
		quantity: number;
		notes: string | null;
		addon: AddonEmbed;
	}> | null;
};

function addonLabels(rows: WaEventRow["event_addons"]): string[] {
	return (rows ?? [])
		.map((a) => {
			const addon = one(a.addon);
			if (!addon) return null;
			return a.quantity > 1
				? `${addon.name} × ${a.quantity}${addon.unit ? ` ${addon.unit}` : ""}`
				: addon.name;
		})
		.filter((s): s is string => Boolean(s));
}

function bonusLabels(rows: WaEventRow["event_bonuses"]): string[] {
	return (rows ?? [])
		.map((b) => {
			const addon = one(b.addon);
			if (!addon) return null;
			const label = `${b.quantity}× ${addon.name}${addon.unit ? ` (${addon.unit})` : ""}`;
			return b.notes ? `${label} — ${b.notes}` : label;
		})
		.filter((s): s is string => Boolean(s));
}

export function toEventForWA(
	row: WaEventRow,
	overrides: Partial<EventForWA> = {},
): EventForWA {
	const pkg = one(row.package);
	const backdrop = one(row.backdrop);
	const picContact = one(row.pic_contact);
	const addons = addonLabels(row.event_addons);
	const bonuses = bonusLabels(row.event_bonuses);

	return {
		project_id: row.project_id,
		client_name: row.client_name,
		client_wa: row.client_wa ?? "",
		event_date: row.event_date,
		event_date_is_estimate: row.event_date_is_estimate ?? null,
		setup_time: row.setup_time ?? null,
		start_time: row.start_time ?? null,
		end_time: row.end_time ?? null,
		session_segments: row.session_segments ?? null,
		venue_name: row.venue_name ?? null,
		venue_address: row.venue_address ?? null,
		venue_city: row.venue_city ?? null,
		venue_province: row.venue_province ?? null,
		google_maps_url: row.google_maps_url ?? null,
		// Kontak PIC yang tersimpan di buku kontak menang atas kolom lepas —
		// sama persis dengan yang dilihat crew di aplikasinya.
		pic_name: picContact?.name ?? row.pic_name ?? null,
		pic_wa: picContact?.phone ?? row.pic_wa ?? null,
		due_date: row.due_date ?? null,
		total_paid: row.total_paid ?? null,
		remaining_balance: row.remaining_balance ?? null,
		package_name: pkg?.name ?? row.custom_package_name ?? null,
		duration_hours: pkg?.duration_hours ?? row.pending_package_hours ?? null,
		frame_size: row.frame_size ?? null,
		backdrop_id: row.backdrop_id ?? null,
		backdrop_color: row.backdrop_color ?? null,
		backdrop_name: backdrop?.name ?? null,
		backdrop_type: backdrop?.type ?? null,
		package_frame_size: pkg?.frame_size ?? null,
		pending_package_hours: row.pending_package_hours ?? null,
		channel: row.channel ?? null,
		vendor_name: row.vendor_name ?? null,
		vendor_pic_name: row.vendor_pic_name ?? null,
		vendor_contact: row.vendor_contact ?? null,
		include_flashdisk_pouch: row.include_flashdisk_pouch ?? null,
		addons_list: addons.length > 0 ? addons : null,
		bonuses_list: bonuses.length > 0 ? bonuses : null,
		crew_notes: row.crew_notes ?? null,
		...overrides,
	};
}
