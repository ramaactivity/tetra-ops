import "server-only";

import { parseHHMM } from "@/lib/availability";
import { loadAvailability } from "@/lib/availability-load";
import type { PortalPerson } from "@/lib/portal/auth";
import {
	type CatalogProduct,
	type Detail,
	groupCatalog,
	type PublicAddonRow,
	type PublicPackageRow,
	quoteSelection,
	type Selection,
} from "@/lib/portal/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { toWaPhone } from "@/lib/whatsapp";

export type Catalog = { products: CatalogProduct[]; addons: PublicAddonRow[] };

export async function loadCatalog(): Promise<Catalog> {
	const admin = createAdminClient();
	const [pk, ad] = await Promise.all([
		admin
			.from("packages")
			.select(
				"category, frame_size, duration_hours, base_price, public_description, public_sort",
			)
			.eq("is_public", true)
			.eq("is_active", true)
			.is("deleted_at", null),
		admin
			.from("addons")
			.select("id, name, unit, price, min_qty")
			.eq("is_public", true)
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("price"),
	]);
	return {
		products: groupCatalog((pk.data ?? []) as PublicPackageRow[]),
		addons: (ad.data ?? []).map((a) => ({
			...a,
			price: Number(a.price),
		})) as PublicAddonRow[],
	};
}

export async function configNumber(
	key: string,
	fallback: number,
): Promise<number> {
	const { data } = await createAdminClient()
		.from("system_config")
		.select("value")
		.eq("key", key)
		.maybeSingle();
	const n = Number(data?.value);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Slot masih cukup untuk pilihan ini? Jam belum pasti = cek sehari penuh. */
export async function slotAvailable(
	sel: Pick<Selection, "date" | "start" | "hours" | "units" | "city">,
	excludeBookingId?: string,
): Promise<boolean> {
	const reqStart = sel.start ? (parseHHMM(sel.start) as number) : 0;
	const reqEnd = sel.start
		? Math.min(reqStart + sel.hours * 60, 24 * 60 - 1)
		: 24 * 60 - 1;
	const r = await loadAvailability(createAdminClient(), {
		date: sel.date,
		reqStart,
		reqEnd,
		city: sel.city,
		excludeBookingId,
	});
	return r.units_free >= sel.units;
}

export type PortalBooking = {
	id: string;
	public_code: string;
	status: "draft" | "menunggu_konfirmasi" | "resmi" | "kedaluwarsa" | "batal";
	service_type: string;
	package_hours: number;
	frame_size: string | null;
	unit_count: number;
	addons: Array<{ addon_id: string; quantity: number }>;
	quoted_total: number;
	event_date: string;
	start_time: string | null;
	end_time: string | null;
	venue_city: string | null;
	detail: Detail;
	expires_at: string;
	event_id: string | null;
	created_at: string;
	channel: "direct" | "vendor" | "relasi";
	vendor_contact_id: string | null;
	managed_by: "klien" | "wo" | "tetra";
	role: "pemesan" | "pemilik" | "wo";
};

const BOOKING_COLS =
	"id, public_code, status, service_type, package_hours, frame_size, unit_count, addons, quoted_total, event_date, start_time, end_time, venue_city, detail, expires_at, event_id, created_at, channel, vendor_contact_id, managed_by";

/** Booking milik orang ini saja — satu-satunya pintu baca data booking di portal. */
export async function loadMyBooking(
	person: PortalPerson,
	code: string,
): Promise<PortalBooking | null> {
	if (!/^[A-Z2-9]{6}$/.test(code)) return null;
	const admin = createAdminClient();
	const { data: b } = await admin
		.from("client_bookings")
		.select(BOOKING_COLS)
		.eq("public_code", code)
		.maybeSingle();
	if (!b) return null;
	const { data: m } = await admin
		.from("booking_members")
		.select("role")
		.eq("booking_id", b.id)
		.eq("person_id", person.id)
		.maybeSingle();
	if (!m) return null;
	return {
		...(b as Omit<PortalBooking, "role">),
		quoted_total: Number(b.quoted_total),
		role: m.role,
	} as PortalBooking;
}

export async function loadMyBookings(
	person: PortalPerson,
): Promise<PortalBooking[]> {
	const admin = createAdminClient();
	const { data: ms } = await admin
		.from("booking_members")
		.select("role, booking_id")
		.eq("person_id", person.id);
	const ids = (ms ?? []).map((m) => m.booking_id);
	if (ids.length === 0) return [];
	const { data } = await admin
		.from("client_bookings")
		.select(BOOKING_COLS)
		.in("id", ids)
		.order("event_date", { ascending: true });
	return (data ?? []).map((b) => ({
		...(b as Omit<PortalBooking, "role">),
		quoted_total: Number(b.quoted_total),
		role: (ms ?? []).find((m) => m.booking_id === b.id)?.role,
	})) as PortalBooking[];
}

/** Harga ulang dari katalog sekarang (dipakai saat buat draf & tampilan). */
export function selectionOf(b: PortalBooking): Selection {
	return {
		category: b.service_type,
		hours: b.package_hours,
		frame: (b.frame_size as Selection["frame"]) ?? null,
		units: b.unit_count,
		addons: b.addons.map((a) => ({ id: a.addon_id, qty: a.quantity })),
		date: b.event_date,
		start: b.start_time?.slice(0, 5) ?? null,
		city: b.venue_city,
	};
}

export { quoteSelection };

/**
 * WO/vendor yang dikenal dari nomor WA-nya (master kontak vendor: nomor
 * utama, PIC default, atau salah satu PIC). Dipakai supaya booking dari WO
 * otomatis tercatat channel vendor dengan skema komisi default-nya.
 */
export async function vendorForPhone(
	phone: string,
): Promise<{ id: string; name: string } | null> {
	const { data } = await createAdminClient()
		.from("contacts")
		.select("id, name, phone, default_pic_contact, vendor_pics")
		.eq("type", "vendor")
		.eq("is_active", true);
	const norm = (v: unknown) =>
		typeof v === "string" && v ? toWaPhone(v) : null;
	for (const c of data ?? []) {
		const pics = (c.vendor_pics as Array<{ contact?: string }> | null) ?? [];
		const nums = [
			c.phone,
			c.default_pic_contact,
			...pics.map((p) => p.contact),
		].map(norm);
		if (nums.includes(phone))
			return { id: c.id as string, name: c.name as string };
	}
	return null;
}
