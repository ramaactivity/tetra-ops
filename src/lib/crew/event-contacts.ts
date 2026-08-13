import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Kontak hari-H (PIC lapangan & pembooking) untuk aplikasi crew.
 *
 * Kenapa lewat service-role: sejak migrasi 20260721c tabel `contacts` owner-only
 * karena berisi PII klien. Halaman crew meng-embed pic_contact/booker_contact
 * lewat sesi crew, jadi hasilnya SELALU null — PIC yang sebenarnya sudah terisi
 * tampil "menyusul" di HP crew dan panel "Data belum lengkap" ikut salah alarm.
 *
 * Membuka `contacts` di RLS akan memberi crew akses ke seluruh buku kontak,
 * jauh lebih luas dari yang dibutuhkan. Jadi bacaannya dipagari di sini:
 * hanya dua kontak yang menempel pada SATU event, dan hanya kalau pemanggil
 * memang ditugaskan di event itu.
 */

export type EventContact = { name: string | null; phone: string | null };

export type EventContacts = {
	pic: EventContact | null;
	booker: EventContact | null;
};

const EMPTY: EventContacts = { pic: null, booker: null };

export async function getAssignedEventContacts(
	eventId: string,
	userId: string,
): Promise<EventContacts> {
	const admin = createAdminClient();

	// Pagar: tanpa penugasan, tidak ada kontak yang dikembalikan.
	const { data: assignment } = await admin
		.from("crew_assignments")
		.select("id")
		.eq("event_id", eventId)
		.eq("user_id", userId)
		.maybeSingle();
	if (!assignment) return EMPTY;

	const { data: event } = await admin
		.from("events")
		.select("pic_contact_id, booker_contact_id")
		.eq("id", eventId)
		.maybeSingle();
	if (!event) return EMPTY;

	const ids = [event.pic_contact_id, event.booker_contact_id].filter(
		(v): v is string => Boolean(v),
	);
	if (ids.length === 0) return EMPTY;

	const { data: contacts } = await admin
		.from("contacts")
		.select("id, name, phone")
		.in("id", ids);

	const byId = new Map(
		(
			(contacts ?? []) as Array<{
				id: string;
				name: string | null;
				phone: string | null;
			}>
		).map((c) => [c.id, { name: c.name, phone: c.phone }]),
	);

	return {
		pic: event.pic_contact_id
			? (byId.get(event.pic_contact_id as string) ?? null)
			: null,
		booker: event.booker_contact_id
			? (byId.get(event.booker_contact_id as string) ?? null)
			: null,
	};
}
