import "server-only";

/**
 * Dasbor rekanan (owner 9 Okt 2026): satu undangan per vendor. Orang portal yang
 * terdaftar di vendor_members melihat SEMUA event dengan events.vendor_contact_id
 * kontak itu (lampau, mendatang, dan yang dibuat nanti) sebagai WO, plus rekap
 * komisi (event mode komisi) dan tagihan (event potongan langsung).
 */
import { missingForDp, payerFromCommissionMode } from "@/lib/portal/core";
import {
	EVENT_BOOKING_SELECT,
	type EventForBooking,
	ensureEventBooking,
} from "@/lib/portal/event-booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { vendorSettings } from "@/lib/vendor-settings";

export type RekananRow = {
	code: string;
	eventId: string | null;
	projectId: string | null;
	title: string;
	date: string;
	start: string | null;
	venue: string | null;
	status: "draf" | "dp_dicek" | "resmi" | "selesai" | "batal";
	payer: "klien" | "wo" | null;
	/** Sisa tagihan ke Tetra (hanya event yang dibayar WO). */
	remaining: number | null;
	clientInvited: boolean;
	designDone: boolean;
	missingData: number;
	commission: { amount: number; paidAt: string | null } | null;
};

/** Kontak vendor yang dipegang orang ini. */
export async function vendorContactsOf(
	personId: string,
): Promise<Array<{ id: string; name: string }>> {
	const admin = createAdminClient();
	const { data } = await admin
		.from("vendor_members")
		.select("contact:contacts(id, name, vendor_settings)")
		.eq("person_id", personId);
	// to-one embed → object. Akses dimatikan di Pusat Vendor → tidak dihitung.
	return (data ?? [])
		.map(
			(r) =>
				r.contact as unknown as {
					id: string;
					name: string;
					vendor_settings: unknown;
				} | null,
		)
		.filter(
			(c): c is { id: string; name: string; vendor_settings: unknown } =>
				!!c && vendorSettings(c.vendor_settings).portal_enabled,
		)
		.map((c) => ({ id: c.id, name: c.name }));
}

/**
 * Pastikan setiap event vendor punya dashboard & orang ini anggotanya (WO).
 * Idempoten; hanya menyentuh event yang belum tertaut.
 */
export async function syncVendorBookings(personId: string): Promise<void> {
	const contacts = await vendorContactsOf(personId);
	if (contacts.length === 0) return;
	const admin = createAdminClient();
	const { data: evs } = await admin
		.from("events")
		.select(EVENT_BOOKING_SELECT)
		.in(
			"vendor_contact_id",
			contacts.map((c) => c.id),
		)
		.is("deleted_at", null);
	const events = (evs ?? []) as unknown as EventForBooking[];
	if (events.length === 0) return;
	const { data: linked } = await admin
		.from("client_bookings")
		.select("id, event_id, members:booking_members(person_id)")
		.in(
			"event_id",
			events.map((e) => e.id),
		);
	const has = new Set(
		(linked ?? [])
			.filter((b) =>
				((b.members ?? []) as Array<{ person_id: string }>).some(
					(m) => m.person_id === personId,
				),
			)
			.map((b) => b.event_id as string),
	);
	for (const ev of events) {
		if (has.has(ev.id)) continue;
		const b = await ensureEventBooking(ev, personId, { asWo: true });
		if (!b) continue;
		await admin
			.from("booking_members")
			.upsert(
				{ booking_id: b.id, person_id: personId, role: "wo" },
				{ onConflict: "booking_id,person_id", ignoreDuplicates: true },
			);
	}
}

/** Baris dasbor rekanan: semua booking yang orang ini pegang sebagai WO. */
export async function rekananRows(
	personId: string,
	today: string,
): Promise<RekananRow[]> {
	const admin = createAdminClient();
	const { data: ms } = await admin
		.from("booking_members")
		.select("booking_id")
		.eq("person_id", personId)
		.eq("role", "wo");
	const ids = (ms ?? []).map((m) => m.booking_id);
	if (ids.length === 0) return [];
	const { data: bks } = await admin
		.from("client_bookings")
		.select(
			"id, public_code, status, event_date, start_time, venue_city, detail, payer, event_id, vendor_contact_id, members:booking_members(role)",
		)
		.in("id", ids);
	const evIds = (bks ?? [])
		.map((b) => b.event_id as string | null)
		.filter((x): x is string => !!x);
	const [{ data: evs }, { data: pays }] = await Promise.all([
		evIds.length
			? admin
					.from("events")
					.select(
						"id, project_id, event_title, client_name, event_date, start_time, venue_name, venue_city, status, remaining_balance, design_status, vendor_commission_mode, vendor_commission_amount, vendor_contact_id, deleted_at",
					)
					.in("id", evIds)
			: Promise.resolve({ data: [] }),
		evIds.length
			? admin
					.from("commission_payouts")
					.select("event_id, payment_date")
					.in("event_id", evIds)
					.eq("kind", "vendor")
					.eq("is_reversed", false)
			: Promise.resolve({ data: [] }),
	]);
	const evById = new Map((evs ?? []).map((e) => [e.id as string, e]));
	// Pusat Vendor: akses dimatikan → acara vendor itu disembunyikan; komisi
	// disembunyikan kalau owner mematikan "tampilkan komisi".
	const vIds = [
		...new Set(
			[
				...(evs ?? []).map((e) => e.vendor_contact_id as string | null),
				...(bks ?? []).map(
					(b) =>
						(b as { vendor_contact_id?: string | null }).vendor_contact_id ??
						null,
				),
			].filter((x): x is string => !!x),
		),
	];
	const { data: vcs } = vIds.length
		? await admin.from("contacts").select("id, vendor_settings").in("id", vIds)
		: { data: [] };
	const setOf = new Map(
		(vcs ?? []).map((c) => [c.id as string, vendorSettings(c.vendor_settings)]),
	);
	const paidAt = new Map(
		(pays ?? []).map((p) => [p.event_id as string, p.payment_date as string]),
	);
	const rows: RekananRow[] = [];
	for (const b of bks ?? []) {
		const ev = b.event_id ? evById.get(b.event_id as string) : null;
		if (ev?.deleted_at) continue;
		const vset = setOf.get(
			((ev?.vendor_contact_id as string | null) ??
				(b.vendor_contact_id as string | null) ??
				"") as string,
		);
		if (vset && !vset.portal_enabled) continue;
		const detail = (b.detail ?? {}) as {
			nama_acara?: string;
			venue_nama?: string;
		};
		const members = (b.members ?? []) as Array<{ role: string }>;
		const date = (ev?.event_date as string) ?? (b.event_date as string);
		const payer =
			(b.payer as "klien" | "wo" | null) ??
			payerFromCommissionMode(ev?.vendor_commission_mode as string | null);
		const cancelled = ev?.status === "cancelled" || b.status === "batal";
		const status: RekananRow["status"] = cancelled
			? "batal"
			: ev
				? date < today
					? "selesai"
					: "resmi"
				: b.status === "menunggu_konfirmasi"
					? "dp_dicek"
					: b.status === "kedaluwarsa"
						? "batal"
						: "draf";
		const commissionMode = ev?.vendor_commission_mode === "commission";
		rows.push({
			code: b.public_code as string,
			eventId: (ev?.id as string) ?? null,
			projectId: (ev?.project_id as string) ?? null,
			title:
				detail.nama_acara ||
				(ev?.event_title as string) ||
				(ev?.client_name as string) ||
				"Acara",
			date,
			start:
				((ev?.start_time ?? b.start_time) as string | null)?.slice(0, 5) ??
				null,
			venue:
				(ev?.venue_name as string) ||
				detail.venue_nama ||
				(ev?.venue_city as string) ||
				(b.venue_city as string) ||
				null,
			status,
			payer,
			remaining:
				ev && payer === "wo" ? Number(ev.remaining_balance ?? 0) : null,
			clientInvited: members.some((m) => m.role === "pemilik"),
			designDone: ev?.design_status === "approved",
			missingData: ev ? 0 : missingForDp(b.detail as never).length,
			commission:
				ev && commissionMode && (vset?.show_commission ?? true)
					? {
							amount: Number(ev.vendor_commission_amount ?? 0),
							paidAt: paidAt.get(ev.id as string) ?? null,
						}
					: null,
		});
	}
	return rows;
}
