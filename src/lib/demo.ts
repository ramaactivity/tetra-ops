import "server-only";

import { DEMO_PHONES } from "@/lib/demo-phones";
import { randomCode } from "@/lib/portal/core";
import {
	EVENT_BOOKING_SELECT,
	type EventForBooking,
	ensureEventBooking,
} from "@/lib/portal/event-booking";
/**
 * Mode Demo (DR-047): data contoh permanen untuk mencoba dashboard klien &
 * dasbor rekanan tanpa mengotori laporan. Event demo = is_demo + deleted_at
 * terisi (tersaring dari semua laporan/KPI/digest/jadwal/Booth); booking portal
 * demo = client_bookings.is_demo. Tidak pernah ada pembayaran/jurnal.
 */
import { createInviteLink } from "@/lib/portal/invite-link";
import { createAdminClient } from "@/lib/supabase/admin";

export const DEMO_VENDOR = "DEMO · Rekanan Contoh";
export const DEMO_PEOPLE = {
	vendor: { phone: DEMO_PHONES[0], name: "Sari (Demo Vendor)" },
	klien: { phone: DEMO_PHONES[1], name: "Nadia (Demo Klien)" },
} as const;

const day = (n: number) =>
	new Date(Date.now() + 7 * 3600_000 + n * 86_400_000)
		.toISOString()
		.slice(0, 10);

/** Hapus semua data demo (event, booking, orang, vendor). */
export async function clearDemo(): Promise<void> {
	const a = createAdminClient();
	const { data: evs } = await a.from("events").select("id").eq("is_demo", true);
	const evIds = (evs ?? []).map((e) => e.id as string);
	const { data: bks } = await a
		.from("client_bookings")
		.select("id")
		.or(
			`is_demo.eq.true${evIds.length ? `,event_id.in.(${evIds.join(",")})` : ""}`,
		);
	const bIds = (bks ?? []).map((b) => b.id as string);
	if (bIds.length) {
		for (const t of [
			"payment_submissions",
			"design_requests",
			"booking_requests",
			"booking_members",
		])
			await a.from(t).delete().in("booking_id", bIds);
		await a.from("client_bookings").delete().in("id", bIds);
	}
	if (evIds.length) {
		for (const t of [
			"design_requests",
			"event_addons",
			"event_bonuses",
			"booth_webhook_outbox",
		])
			await a.from(t).delete().in("event_id", evIds);
		await a.from("events").delete().in("id", evIds);
	}
	const phones = Object.values(DEMO_PEOPLE).map((p) => p.phone);
	const { data: ppl } = await a
		.from("portal_people")
		.select("id")
		.in("phone", phones);
	const pIds = (ppl ?? []).map((p) => p.id as string);
	if (pIds.length) {
		for (const t of [
			"portal_invites",
			"portal_sessions",
			"vendor_members",
			"booking_members",
			"booking_leads",
		])
			await a.from(t).delete().in("person_id", pIds);
		await a.from("portal_people").delete().in("id", pIds);
	}
	await a
		.from("contacts")
		.delete()
		.eq("name", DEMO_VENDOR)
		.eq("type", "vendor");
}

/** Buat ulang data demo dari nol. */
export async function resetDemo(ownerUserId: string): Promise<void> {
	await clearDemo();
	const a = createAdminClient();
	const now = new Date().toISOString();
	const { data: pkgs } = await a
		.from("packages")
		.select("id, name")
		.in("name", [
			"4R Unlimited 3 Jam",
			"2R Unlimited 2 Jam",
			"Polaroid Unlimited 4 Jam",
		]);
	const pkg = (n: string) => pkgs?.find((p) => p.name === n)?.id ?? null;

	const { data: vendor } = await a
		.from("contacts")
		.insert({
			name: DEMO_VENDOR,
			type: "vendor",
			phone: `0${DEMO_PEOPLE.vendor.phone.slice(2)}`,
			is_active: false, // tidak muncul di daftar vendor & form booking
			notes:
				"Vendor DEMO untuk mencoba dasbor rekanan. Jangan dipakai untuk booking asli.",
			commission_mode: "upfront_cut",
			commission_value_type: "flat",
			commission_value_default: 500000,
			default_pic_name: DEMO_PEOPLE.vendor.name,
			default_pic_contact: `0${DEMO_PEOPLE.vendor.phone.slice(2)}`,
			vendor_pics: [
				{
					name: DEMO_PEOPLE.vendor.name,
					contact: `0${DEMO_PEOPLE.vendor.phone.slice(2)}`,
					role: "Owner",
				},
			],
		})
		.select("id")
		.single();
	const person = async (p: { phone: string; name: string }) =>
		(
			await a
				.from("portal_people")
				.insert({ phone: p.phone, name: p.name })
				.select("id")
				.single()
		).data?.id as string;
	const wo = await person(DEMO_PEOPLE.vendor);
	const klien = await person(DEMO_PEOPLE.klien);
	await a
		.from("vendor_members")
		.insert({ contact_id: vendor?.id, person_id: wo });

	const base = (
		n: number,
		title: string,
		date: string,
		x: Record<string, unknown>,
	) => ({
		project_id: `PRJ-DEMO-0${n}`,
		created_by: ownerUserId,
		is_demo: true,
		deleted_at: now, // tersaring dari semua laporan (lihat DR-047)
		status: date < day(0) ? "completed" : "upcoming",
		client_name: title,
		client_wa: DEMO_PEOPLE.klien.phone,
		event_title: title,
		service_type: "photobooth_classic",
		event_category: "wedding",
		event_date: date,
		start_time: "16:00",
		end_time: "19:00",
		venue_name: "Gedung Contoh (DEMO)",
		venue_city: "Bogor",
		unit_count: 1,
		design_status: "belum",
		addons_total: 0,
		crew_notes: "DATA DEMO — tidak masuk laporan.",
		...x,
	});
	const viaVendor = {
		channel: "vendor",
		vendor_contact_id: vendor?.id,
		vendor_name: DEMO_VENDOR,
	};
	const { data: evs, error } = await a
		.from("events")
		.insert([
			base(1, "Wedding Nadia & Raka", day(40), {
				...viaVendor,
				package_id: pkg("4R Unlimited 3 Jam"),
				frame_size: "4R",
				base_price: 2500000,
				grand_total: 2500000,
				total_paid: 500000,
				remaining_balance: 2000000,
				payment_status: "partial",
				vendor_commission_mode: "upfront_cut",
				vendor_commission_amount: 0,
			}),
			base(2, "Engagement Sinta & Bima", day(75), {
				...viaVendor,
				event_category: "engagement",
				package_id: pkg("2R Unlimited 2 Jam"),
				frame_size: "2R",
				base_price: 2000000,
				grand_total: 2000000,
				total_paid: 0,
				remaining_balance: 2000000,
				payment_status: "unpaid",
				vendor_commission_mode: "commission",
				vendor_commission_amount: 250000,
			}),
			base(3, "Wedding Ayu & Bayu", day(-20), {
				...viaVendor,
				package_id: pkg("Polaroid Unlimited 4 Jam"),
				frame_size: "polaroid",
				base_price: 3000000,
				grand_total: 3000000,
				total_paid: 3000000,
				remaining_balance: 0,
				payment_status: "paid",
				design_status: "approved",
				vendor_commission_mode: "commission",
				vendor_commission_amount: 300000,
			}),
			base(4, "Ulang Tahun ke-25 Nadia", day(20), {
				channel: "direct",
				event_category: "birthday",
				package_id: pkg("2R Unlimited 2 Jam"),
				frame_size: "2R",
				base_price: 2000000,
				grand_total: 2000000,
				total_paid: 500000,
				remaining_balance: 1500000,
				payment_status: "partial",
			}),
		])
		.select(EVENT_BOOKING_SELECT);
	if (error) throw new Error(`Demo: ${error.message}`);

	const member = async (bookingId: string, personId: string, role: string) =>
		a
			.from("booking_members")
			.upsert(
				{ booking_id: bookingId, person_id: personId, role },
				{ onConflict: "booking_id,person_id", ignoreDuplicates: true },
			);
	const far = new Date(Date.now() + 3650 * 86_400_000).toISOString();
	for (const ev of (evs ?? []) as unknown as EventForBooking[]) {
		const b = await ensureEventBooking(
			ev,
			ev.channel === "vendor" ? wo : klien,
			{
				asWo: ev.channel === "vendor",
				...(ev.project_id !== "PRJ-DEMO-02"
					? { clientName: DEMO_PEOPLE.klien.name }
					: {}),
			},
		);
		if (!b) continue;
		await a
			.from("client_bookings")
			.update({ is_demo: true, expires_at: far })
			.eq("id", b.id);
		if (ev.channel === "vendor") await member(b.id, wo, "wo");
		// Klien demo: pemilik di Wedding Nadia & Raka, pemesan di acara pribadinya.
		if (ev.project_id === "PRJ-DEMO-01") await member(b.id, klien, "pemilik");
		if (ev.project_id === "PRJ-DEMO-04") await member(b.id, klien, "pemesan");
	}

	// Satu booking draf (belum DP, tanpa event) milik klien demo.
	const { data: draft } = await a
		.from("client_bookings")
		.insert({
			public_code: randomCode(6),
			status: "draft",
			is_demo: true,
			service_type: "photobooth_classic",
			package_hours: 3,
			frame_size: "4R",
			unit_count: 1,
			quoted_total: 2500000,
			event_date: day(110),
			start_time: "18:00",
			end_time: "21:00",
			venue_city: "Bogor",
			detail: { nama_acara: "Reuni SMA 2016 (DEMO)", kategori: "reuni" },
			pdp_consent_at: now,
			terms_version: "demo",
			expires_at: far,
			created_by_person: klien,
		})
		.select("id")
		.single();
	if (draft) await member(draft.id, klien, "pemesan");
}

/** Link masuk sekali ketuk untuk akun demo. */
export async function demoLoginLink(
	who: "vendor" | "klien",
): Promise<string | null> {
	const a = createAdminClient();
	const { data: p } = await a
		.from("portal_people")
		.select("id")
		.eq("phone", DEMO_PEOPLE[who].phone)
		.maybeSingle();
	if (!p) return null;
	return createInviteLink(p.id, who === "vendor" ? "vendor" : "klien", {
		vendor_name: who === "vendor" ? DEMO_VENDOR : null,
		title: who === "klien" ? "Dashboard demo" : null,
		role_label: who === "vendor" ? "Owner (demo)" : "Klien (demo)",
		invited_by: "Tetra Photobooth",
		events: who === "vendor" ? 3 : null,
	});
}
