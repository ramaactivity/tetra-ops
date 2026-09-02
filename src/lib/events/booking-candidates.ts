import "server-only";

import type { createClient } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Daftar pilihan untuk form booking (sales/relasi & vendor), diurutkan
 * **dari yang paling sering dipakai**, bukan alfabetis.
 *
 * Alasannya praktis: yang closing event itu orangnya sedikit dan berulang,
 * begitu juga vendornya. Urutan A–Z bikin nama yang tiap minggu dipakai
 * tenggelam di bawah nama yang setahun sekali muncul. Urutan di sini:
 *
 *   1. jumlah pemakaian terbanyak
 *   2. pemakaian terakhir paling baru (tie-break — yang lagi aktif naik)
 *   3. abjad (untuk yang sama sekali belum pernah dipakai)
 *
 * Riwayat dibaca dari event terbaru sebanyak `USAGE_LOOKBACK` baris — cukup
 * untuk menangkap kebiasaan sekarang tanpa menarik seluruh tabel events.
 */

const USAGE_LOOKBACK = 1000;

/** Skor pemakaian satu kandidat: berapa kali dipakai + kapan terakhir. */
type Usage = { count: number; last: string };

function bump(map: Map<string, Usage>, key: string, when: string | null) {
	const prev = map.get(key);
	const last = when ?? "";
	if (prev) {
		prev.count += 1;
		if (last > prev.last) prev.last = last;
	} else {
		map.set(key, { count: 1, last });
	}
}

/** count desc → last-used desc → abjad. */
function byUsage<T>(
	items: T[],
	usageOf: (item: T) => Usage | undefined,
	nameOf: (item: T) => string,
): T[] {
	return [...items].sort((a, b) => {
		const ua = usageOf(a);
		const ub = usageOf(b);
		const ca = ua?.count ?? 0;
		const cb = ub?.count ?? 0;
		if (ca !== cb) return cb - ca;
		const la = ua?.last ?? "";
		const lb = ub?.last ?? "";
		if (la !== lb) return lb.localeCompare(la);
		return nameOf(a).localeCompare(nameOf(b), "id");
	});
}

export type SalesCandidate = {
	id: string;
	full_name: string;
	nickname: string | null;
	role: string;
};

/**
 * User Tetra (owner/crew/admin) yang bisa dipilih sebagai sales atau relasi.
 * Pemakaian dihitung dari kolom `sales_user_id` DAN `referrer_user_id` —
 * satu daftar dipakai kedua picker, dan orang yang sering closing biasanya
 * juga yang sering jadi relasi.
 */
export async function fetchSalesCandidates(
	supabase: ServerSupabase,
): Promise<SalesCandidate[]> {
	const [{ data: users }, { data: history }] = await Promise.all([
		supabase
			.from("users")
			.select("id, full_name, nickname, role")
			.in("role", ["super_admin", "owner", "crew"])
			.eq("is_active", true)
			.is("deleted_at", null)
			.order("full_name"),
		supabase
			.from("events")
			.select("sales_user_id, referrer_user_id, event_date")
			.or("sales_user_id.not.is.null,referrer_user_id.not.is.null")
			.order("event_date", { ascending: false, nullsFirst: false })
			.limit(USAGE_LOOKBACK),
	]);

	const usage = new Map<string, Usage>();
	for (const row of history ?? []) {
		const date = (row.event_date as string | null) ?? null;
		const sales = row.sales_user_id as string | null;
		const referrer = row.referrer_user_id as string | null;
		if (sales) bump(usage, sales, date);
		if (referrer && referrer !== sales) bump(usage, referrer, date);
	}

	const rows = (users ?? []) as SalesCandidate[];
	return byUsage(
		rows,
		(u) => usage.get(u.id),
		(u) => u.full_name ?? "",
	);
}

export type VendorCandidate = {
	name: string;
	pic_name: string | null;
	contact: string | null;
	commission_mode: "commission" | "upfront_cut" | null;
	commission_value_type: "percent" | "flat" | null;
	commission_value: number | null;
	commission_rate: number | null;
};

/**
 * Vendor master (contacts type=vendor) untuk autocomplete channel vendor,
 * diurutkan dari yang paling sering dipakai. Event lama bisa saja cuma punya
 * `vendor_name` tanpa `vendor_contact_id` (sebelum vendor master ada), jadi
 * pemakaian dihitung lewat FK dulu, baru fallback ke nama.
 */
export async function fetchVendorCandidates(
	supabase: ServerSupabase,
): Promise<VendorCandidate[]> {
	const [{ data: vendors }, { data: history }] = await Promise.all([
		supabase
			.from("contacts")
			.select(
				"id, name, default_pic_name, default_pic_contact, commission_mode, commission_value_type, commission_value_default, commission_rate_default",
			)
			.eq("type", "vendor")
			.eq("is_active", true)
			.order("name", { ascending: true })
			.limit(200),
		supabase
			.from("events")
			.select("vendor_contact_id, vendor_name, event_date")
			.eq("channel", "vendor")
			.order("event_date", { ascending: false, nullsFirst: false })
			.limit(USAGE_LOOKBACK),
	]);

	const byId = new Map<string, Usage>();
	const byName = new Map<string, Usage>();
	for (const row of history ?? []) {
		const date = (row.event_date as string | null) ?? null;
		const contactId = row.vendor_contact_id as string | null;
		if (contactId) {
			bump(byId, contactId, date);
			continue; // jangan dihitung dua kali lewat namanya
		}
		const name = (row.vendor_name as string | null)?.trim().toLowerCase();
		if (name) bump(byName, name, date);
	}

	const rows = (vendors ?? []) as Array<{
		id: string;
		name: string;
		default_pic_name: string | null;
		default_pic_contact: string | null;
		commission_mode: "commission" | "upfront_cut" | null;
		commission_value_type: "percent" | "flat" | null;
		commission_value_default: number | null;
		commission_rate_default: number | null;
	}>;

	const usageFor = (v: (typeof rows)[number]): Usage | undefined => {
		const fk = byId.get(v.id);
		const named = byName.get(v.name.trim().toLowerCase());
		if (!fk) return named;
		if (!named) return fk;
		return {
			count: fk.count + named.count,
			last: fk.last > named.last ? fk.last : named.last,
		};
	};

	return byUsage(rows, usageFor, (v) => v.name).map((v) => ({
		name: v.name,
		pic_name: v.default_pic_name,
		contact: v.default_pic_contact,
		commission_mode: v.commission_mode,
		commission_value_type: v.commission_value_type,
		commission_value: v.commission_value_default,
		commission_rate: v.commission_rate_default,
	}));
}

/** Satu venue di master, siap jadi pilihan di form booking. */
export type VenueCandidate = {
	id: string;
	name: string;
	address: string | null;
	city: string | null;
	province: string | null;
	google_maps_url: string | null;
	google_maps_lat: number | null;
	google_maps_lng: number | null;
};

/**
 * Master venue, diurutkan dari yang paling sering dipakai.
 *
 * Urutannya penting di sini: dari 154 event, "Grand Savero" saja muncul 14×
 * sementara 100 venue lain cuma sekali. Abjad akan menenggelamkan yang tiap
 * bulan dipakai di bawah yang setahun sekali.
 */
export async function fetchVenueCandidates(
	supabase: ServerSupabase,
): Promise<VenueCandidate[]> {
	const [{ data: venues }, { data: history }] = await Promise.all([
		supabase
			.from("venues")
			.select(
				"id, name, address, city, province, google_maps_url, google_maps_lat, google_maps_lng",
			)
			.eq("is_active", true)
			.order("name", { ascending: true })
			.limit(500),
		supabase
			.from("events")
			.select("venue_id, venue_name, event_date")
			.order("event_date", { ascending: false, nullsFirst: false })
			.limit(USAGE_LOOKBACK),
	]);

	const byId = new Map<string, Usage>();
	const byName = new Map<string, Usage>();
	for (const row of history ?? []) {
		const date = (row.event_date as string | null) ?? null;
		const venueId = row.venue_id as string | null;
		if (venueId) {
			bump(byId, venueId, date);
			continue; // jangan dihitung dua kali lewat namanya
		}
		const name = (row.venue_name as string | null)?.trim().toLowerCase();
		if (name) bump(byName, name, date);
	}

	const rows = (venues ?? []) as VenueCandidate[];
	const usageFor = (v: VenueCandidate): Usage | undefined => {
		const fk = byId.get(v.id);
		const named = byName.get(v.name.trim().toLowerCase());
		if (!fk) return named;
		if (!named) return fk;
		return {
			count: fk.count + named.count,
			last: fk.last > named.last ? fk.last : named.last,
		};
	};

	return byUsage(rows, usageFor, (v) => v.name);
}
