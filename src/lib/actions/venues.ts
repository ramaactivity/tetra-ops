"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Master venue — pasangan `ensureVendorContact` untuk lokasi event.
 *
 * Dipanggil saat booking disimpan: venue yang sudah ada dipakai ulang, venue
 * baru dibuat otomatis. Yang membuat master ini makin berguna adalah bagian
 * "belajar": kalau booking kali ini mengisi link Google Maps atau kota yang
 * belum dimiliki master, master ikut dilengkapi — jadi booking berikutnya untuk
 * venue yang sama langsung auto-terisi.
 *
 * Ini yang menutup pola lama: "Grand Savero" dipakai 14× tapi link Maps-nya
 * cuma terisi 3× karena tiap booking mulai dari kosong.
 */

export type EnsureVenueInput = {
	name: string;
	address?: string | null;
	city?: string | null;
	province?: string | null;
	google_maps_url?: string | null;
	google_maps_lat?: number | null;
	google_maps_lng?: number | null;
};

const clean = (v: string | null | undefined): string | null => {
	const t = (v ?? "").trim();
	return t ? t : null;
};

/**
 * Kembalikan id master venue untuk nama ini, buat kalau belum ada.
 *
 * Sengaja TIDAK melempar error: venue itu pelengkap, bukan syarat sahnya
 * booking. Kalau master gagal ditulis, booking tetap tersimpan dengan kolom
 * venue_* apa adanya dan cuma kehilangan tautan masternya.
 */
export async function ensureVenue(
	input: EnsureVenueInput,
): Promise<string | null> {
	const name = clean(input.name);
	if (!name) return null;

	const supabase = await createClient();

	const { data: existing } = await supabase
		.from("venues")
		.select(
			"id, address, city, province, google_maps_url, google_maps_lat, google_maps_lng",
		)
		.eq("is_active", true)
		.ilike("name", name)
		.maybeSingle();

	if (existing) {
		// Hanya ISI YANG KOSONG. Master tidak boleh ditimpa data booking yang
		// lebih miskin — kalau master sudah punya link Maps, booking tanpa link
		// tidak boleh menghapusnya.
		const patch: Record<string, string | number> = {};
		const fill = (
			key: keyof typeof existing,
			value: string | number | null,
		) => {
			if (value === null || value === undefined) return;
			if (existing[key] === null || existing[key] === undefined) {
				patch[key as string] = value;
			}
		};
		fill("address", clean(input.address));
		fill("city", clean(input.city));
		fill("province", clean(input.province));
		fill("google_maps_url", clean(input.google_maps_url));
		fill("google_maps_lat", input.google_maps_lat ?? null);
		fill("google_maps_lng", input.google_maps_lng ?? null);

		if (Object.keys(patch).length > 0) {
			patch.updated_at = new Date().toISOString();
			await supabase.from("venues").update(patch).eq("id", existing.id);
		}
		return existing.id as string;
	}

	const { data: created, error } = await supabase
		.from("venues")
		.insert({
			name,
			address: clean(input.address),
			city: clean(input.city),
			province: clean(input.province),
			google_maps_url: clean(input.google_maps_url),
			google_maps_lat: input.google_maps_lat ?? null,
			google_maps_lng: input.google_maps_lng ?? null,
		})
		.select("id")
		.single();

	if (error || !created) {
		// Balapan dua booking dengan venue baru bernama sama: indeks unik
		// menolak yang kedua. Ambil saja baris yang sudah menang.
		const { data: raced } = await supabase
			.from("venues")
			.select("id")
			.eq("is_active", true)
			.ilike("name", name)
			.maybeSingle();
		return (raced?.id as string) ?? null;
	}

	return created.id as string;
}
