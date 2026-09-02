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

// ---------------------------------------------------------------------------
// Master venue — kelola dari halaman /venues
// ---------------------------------------------------------------------------

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-user";

type VenueErrors = Record<string, string[] | undefined>;
export type VenueFormState =
	| { ok?: true; errors?: VenueErrors; info?: string }
	| undefined;

async function requireOwner() {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");
	if (user.profile.role !== "super_admin" && user.profile.role !== "owner") {
		throw new Error("Forbidden — owner-level only");
	}
	return user;
}

function revalidateVenues() {
	revalidatePath("/venues");
	revalidatePath("/operations/new");
}

/** formData.get() mengembalikan null untuk field absen — .nullish() wajib. */
const OptText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => (v ? v : null));

const UpdateSchema = z.object({
	id: z.uuid("Venue tidak valid"),
	name: z.string().trim().min(2, "Minimal 2 karakter").max(120),
	address: OptText(255),
	city: OptText(60),
	province: OptText(60),
	google_maps_url: OptText(500),
});

export async function updateVenue(
	_prev: VenueFormState,
	formData: FormData,
): Promise<VenueFormState> {
	await requireOwner();

	const parsed = UpdateSchema.safeParse({
		id: formData.get("id"),
		name: formData.get("name"),
		address: formData.get("address"),
		city: formData.get("city"),
		province: formData.get("province"),
		google_maps_url: formData.get("google_maps_url"),
	});
	if (!parsed.success) {
		return { errors: parsed.error.flatten().fieldErrors as VenueErrors };
	}

	const supabase = await createClient();
	const { error } = await supabase
		.from("venues")
		.update({ ...parsed.data, updated_at: new Date().toISOString() })
		.eq("id", parsed.data.id);

	if (error) {
		// Indeks unik nama: pesan mentah Postgres tidak berguna buat owner.
		const dup = error.message.includes("venues_name_unique_active");
		return {
			errors: {
				[dup ? "name" : "_form"]: [
					dup
						? "Sudah ada venue aktif dengan nama ini. Gabungkan saja keduanya."
						: error.message,
				],
			},
		};
	}

	revalidateVenues();
	return { ok: true };
}

const MergeSchema = z.object({
	source_id: z.uuid("Venue yang mau digabung tidak valid"),
	target_id: z.uuid("Venue tujuan tidak valid"),
	rename_events: z.coerce.boolean(),
});

/**
 * Gabungkan dua master venue yang sebenarnya tempat yang sama.
 *
 * Seluruh langkahnya ada di RPC `merge_venues` supaya atomik — memindahkan
 * event tapi gagal mengarsipkan sumbernya akan meninggalkan duplikat kosong
 * yang tetap muncul di daftar pilihan.
 */
export async function mergeVenues(
	_prev: VenueFormState,
	formData: FormData,
): Promise<VenueFormState> {
	await requireOwner();

	const parsed = MergeSchema.safeParse({
		source_id: formData.get("source_id"),
		target_id: formData.get("target_id"),
		rename_events: formData.get("rename_events") === "on",
	});
	if (!parsed.success) {
		return { errors: parsed.error.flatten().fieldErrors as VenueErrors };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("merge_venues", {
		p_source_id: parsed.data.source_id,
		p_target_id: parsed.data.target_id,
		p_rename_events: parsed.data.rename_events,
	});
	if (error) return { errors: { _form: [error.message] } };

	const res = data as {
		moved_events?: number;
		source_name?: string;
		target_name?: string;
	} | null;
	revalidateVenues();
	return {
		ok: true,
		info: `${res?.source_name ?? "Venue"} digabung ke ${
			res?.target_name ?? "venue tujuan"
		} — ${res?.moved_events ?? 0} event dipindah.`,
	};
}

/** Arsipkan / aktifkan lagi. Diarsipkan, bukan dihapus — event lama tetap tertaut. */
export async function setVenueActive(
	id: string,
	isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
	await requireOwner();
	const supabase = await createClient();
	const { error } = await supabase
		.from("venues")
		.update({ is_active: isActive, updated_at: new Date().toISOString() })
		.eq("id", id);
	if (error) {
		const dup = error.message.includes("venues_name_unique_active");
		return {
			ok: false,
			error: dup
				? "Ada venue aktif lain dengan nama sama — ganti namanya dulu."
				: error.message,
		};
	}
	revalidateVenues();
	return { ok: true };
}
