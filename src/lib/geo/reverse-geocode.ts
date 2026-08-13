import "server-only";

/**
 * Menerjemahkan satu titik koordinat (+ nama tempat dari URL Maps) menjadi
 * alamat Indonesia yang rapi.
 *
 * Kenapa dua sumber:
 *
 * • **Google** dipakai kalau `GOOGLE_MAPS_API_KEY` ada. Ini satu-satunya cara
 *   mendapat alamat yang PERSIS seperti yang tertulis di Google Maps, karena
 *   datanya memang milik Google.
 *
 * • **OpenStreetMap (Nominatim)** jadi cadangan tanpa API key. Perlu diketahui
 *   batasnya: untuk banyak venue di Indonesia OSM tidak punya nama jalan atau
 *   nomor rumahnya sama sekali. Contoh nyata — Sasono Mulyo Depok: Google
 *   menulis "Jl. Raya Kalimulya No.30, Jatimulya, Kec. Cilodong", OSM cuma
 *   punya "Jatimulya". Itu bukan bug parser, melainkan datanya memang tidak
 *   ada. Karena itu hasil OSM ditandai `source: "osm"` supaya UI bisa bilang
 *   "perkiraan, cek lagi" alih-alih pura-pura akurat.
 */

export type GeoAddress = {
	/** Baris alamat: jalan + nomor, kelurahan, kecamatan. Tanpa kota/provinsi. */
	address: string | null;
	/** Kota / Kabupaten — apa adanya dari sumber ("Kota Depok", "Kabupaten Bogor"). */
	city: string | null;
	province: string | null;
	postcode: string | null;
	source: "google" | "osm";
};

const UA = "TetraOps/1.0 (tetra-ops.vercel.app)";

/** "West Java" → "Jawa Barat". Nominatim sering memberi nama Inggris. */
const PROVINCE_ID: Record<string, string> = {
	"west java": "Jawa Barat",
	"central java": "Jawa Tengah",
	"east java": "Jawa Timur",
	banten: "Banten",
	"west kalimantan": "Kalimantan Barat",
	"central kalimantan": "Kalimantan Tengah",
	"east kalimantan": "Kalimantan Timur",
	"north kalimantan": "Kalimantan Utara",
	"south kalimantan": "Kalimantan Selatan",
	"north sumatra": "Sumatera Utara",
	"south sumatra": "Sumatera Selatan",
	"west sumatra": "Sumatera Barat",
	"west sulawesi": "Sulawesi Barat",
	"central sulawesi": "Sulawesi Tengah",
	"south sulawesi": "Sulawesi Selatan",
	"southeast sulawesi": "Sulawesi Tenggara",
	"north sulawesi": "Sulawesi Utara",
	"special region of yogyakarta": "DI Yogyakarta",
	"special capital region of jakarta": "DKI Jakarta",
	"jakarta special capital region": "DKI Jakarta",
};

function normalizeProvince(v: string | null): string | null {
	if (!v) return null;
	return PROVINCE_ID[v.toLowerCase().trim()] ?? v;
}

/** "Bogor Regency" → "Kabupaten Bogor"; "Depok City" → "Kota Depok". */
function normalizeCity(v: string | null): string | null {
	if (!v) return null;
	const s = v.trim();
	if (/\bregency\b/i.test(s)) {
		return `Kabupaten ${s.replace(/\bregency\b/i, "").trim()}`;
	}
	if (/\bcity\b/i.test(s)) return `Kota ${s.replace(/\bcity\b/i, "").trim()}`;
	return s;
}

/** Gabung bagian alamat tanpa duplikat beruntun dan tanpa nilai kosong. */
function joinParts(parts: Array<string | null | undefined>): string | null {
	const out: string[] = [];
	for (const raw of parts) {
		const p = raw?.trim();
		if (!p) continue;
		if (out.some((existing) => existing.toLowerCase() === p.toLowerCase())) {
			continue;
		}
		out.push(p);
	}
	return out.length > 0 ? out.join(", ") : null;
}

/** Awalan "Kec." seperti gaya penulisan Google. */
function withKecPrefix(v: string | null): string | null {
	if (!v) return null;
	const s = v.trim();
	if (/^(kec\.?|kecamatan|distrik)\s/i.test(s)) return s;
	return `Kec. ${s}`;
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

type GoogleComponent = {
	longText?: string;
	shortText?: string;
	long_name?: string;
	short_name?: string;
	types: string[];
};

function pickComponent(
	components: GoogleComponent[],
	type: string,
): string | null {
	const hit = components.find((c) => c.types?.includes(type));
	return hit?.longText ?? hit?.long_name ?? null;
}

/**
 * Susun alamat dari address_components Google. Pemetaan Indonesia:
 * level 4 = kelurahan/desa, level 3 = kecamatan, level 2 = kota/kabupaten,
 * level 1 = provinsi.
 */
function fromGoogleComponents(components: GoogleComponent[]): GeoAddress {
	const route = pickComponent(components, "route");
	const number = pickComponent(components, "street_number");
	const street = route ? (number ? `${route} No.${number}` : route) : null;
	const kelurahan =
		pickComponent(components, "administrative_area_level_4") ??
		pickComponent(components, "sublocality_level_1") ??
		pickComponent(components, "sublocality");
	const kecamatan =
		pickComponent(components, "administrative_area_level_3") ??
		pickComponent(components, "locality");
	const kota =
		pickComponent(components, "administrative_area_level_2") ??
		pickComponent(components, "locality");

	return {
		address: joinParts([street, kelurahan, withKecPrefix(kecamatan)]),
		city: normalizeCity(kota),
		province: normalizeProvince(
			pickComponent(components, "administrative_area_level_1"),
		),
		postcode: pickComponent(components, "postal_code"),
		source: "google",
	};
}

/**
 * Places API (New) Text Search — dicari dengan NAMA tempat + bias ke titik pin,
 * jadi yang kembali adalah alamat kartu tempat itu sendiri, bukan alamat
 * bangunan terdekat seperti hasil reverse-geocode biasa.
 */
async function googlePlaceSearch(
	apiKey: string,
	placeName: string,
	lat: number,
	lng: number,
): Promise<GeoAddress | null> {
	try {
		const res = await fetch(
			"https://places.googleapis.com/v1/places:searchText",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Goog-Api-Key": apiKey,
					"X-Goog-FieldMask":
						"places.formattedAddress,places.addressComponents,places.displayName",
				},
				body: JSON.stringify({
					textQuery: placeName,
					languageCode: "id",
					regionCode: "ID",
					maxResultCount: 1,
					locationBias: {
						circle: {
							center: { latitude: lat, longitude: lng },
							radius: 300,
						},
					},
				}),
			},
		);
		if (!res.ok) return null;
		const json = (await res.json()) as {
			places?: Array<{ addressComponents?: GoogleComponent[] }>;
		};
		const components = json.places?.[0]?.addressComponents;
		if (!components || components.length === 0) return null;
		return fromGoogleComponents(components);
	} catch {
		return null;
	}
}

/** Geocoding API reverse — cadangan kalau pencarian nama tidak membuahkan hasil. */
async function googleReverse(
	apiKey: string,
	lat: number,
	lng: number,
): Promise<GeoAddress | null> {
	try {
		const res = await fetch(
			`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=id&result_type=street_address|premise|establishment|subpremise|route&key=${apiKey}`,
		);
		if (!res.ok) return null;
		const json = (await res.json()) as {
			status?: string;
			results?: Array<{ address_components?: GoogleComponent[] }>;
		};
		if (json.status !== "OK") return null;
		const components = json.results?.[0]?.address_components;
		if (!components || components.length === 0) return null;
		return fromGoogleComponents(components);
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// OpenStreetMap (cadangan tanpa API key)
// ---------------------------------------------------------------------------

/** Susun GeoAddress dari objek `address` Nominatim. */
function fromOsmAddress(a: Record<string, string>): GeoAddress {
	// Nama jalan Indonesia di OSM ditulis lengkap ("Jalan Raya Kalimulya"),
	// nomor rumah terpisah — disusun seperti gaya Google.
	const road = a.road ?? null;
	const street = road
		? a.house_number
			? `${road} No.${a.house_number}`
			: road
		: null;
	const kelurahan =
		a.village ?? a.neighbourhood ?? a.hamlet ?? a.suburb ?? null;
	// Pemetaan kecamatan di Nominatim tidak konsisten antar-daerah; ambil yang
	// paling sering benar dan pastikan tidak menduplikasi kelurahan.
	// HANYA city_district/municipality: field `district`/`suburb` di Indonesia
	// sering berisi nama kawasan acak ("Proyek") yang bukan kecamatan.
	const kecamatanRaw = a.city_district ?? a.municipality ?? null;
	const kecamatan =
		kecamatanRaw && kecamatanRaw !== kelurahan ? kecamatanRaw : null;
	const city =
		a.city ?? a.town ?? a.county ?? a.state_district ?? a.municipality ?? null;

	return {
		address: joinParts([street, kelurahan, withKecPrefix(kecamatan)]),
		city: normalizeCity(city),
		province: normalizeProvince(a.state ?? null),
		postcode: a.postcode ?? null,
		source: "osm",
	};
}

/** Jarak kasar dua koordinat dalam meter (cukup untuk cek "ini tempat yang sama?"). */
function metersBetween(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const dLat = (lat1 - lat2) * 111_320;
	const dLng = (lng1 - lng2) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
	return Math.hypot(dLat, dLng);
}

/**
 * Cari venue di OSM berdasarkan NAMA, lalu pastikan hasilnya benar-benar di
 * titik yang sama dengan pin.
 *
 * Kenapa ini lebih baik daripada reverse-geocode: reverse memberi jalan
 * TERDEKAT dari pin, yang sering bukan alamat resmi venue-nya. Contoh nyata —
 * Hotel Braja Mustika: reverse bilang "Jalan Pemutihan", padahal alamat
 * hotelnya "Jalan Dr. Sumeru". Pencarian nama mengembalikan alamat POI-nya.
 */
async function osmPlaceSearch(
	placeName: string,
	lat: number,
	lng: number,
): Promise<GeoAddress | null> {
	try {
		const res = await fetch(
			`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=jsonv2&addressdetails=1&limit=3&accept-language=id&countrycodes=id`,
			{ headers: { "User-Agent": UA } },
		);
		if (!res.ok) return null;
		const rows = (await res.json()) as Array<{
			lat: string;
			lon: string;
			address?: Record<string, string>;
		}>;
		for (const row of rows) {
			const rLat = Number.parseFloat(row.lat);
			const rLng = Number.parseFloat(row.lon);
			if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) continue;
			// 400 m: cukup longgar untuk beda titik pin vs centroid bangunan, cukup
			// ketat untuk menolak venue bernama mirip di kota lain.
			if (metersBetween(lat, lng, rLat, rLng) > 400) continue;
			const built = fromOsmAddress(row.address ?? {});
			if (built.address) return built;
		}
		return null;
	} catch {
		return null;
	}
}

async function osmReverse(
	lat: number,
	lng: number,
): Promise<GeoAddress | null> {
	try {
		const res = await fetch(
			`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=id&zoom=18&addressdetails=1`,
			{ headers: { "User-Agent": UA } },
		);
		if (!res.ok) return null;
		const json = (await res.json()) as { address?: Record<string, string> };
		return fromOsmAddress(json.address ?? {});
	} catch {
		return null;
	}
}

/**
 * Alamat terbaik yang bisa didapat untuk sebuah pin.
 * Urutan: Google (kalau ada API key) → OSM. Mengembalikan null kalau dua-duanya
 * tidak memberi apa-apa.
 */
export async function resolveAddressAt(
	lat: number,
	lng: number,
	placeName: string | null,
): Promise<GeoAddress | null> {
	const apiKey = process.env.GOOGLE_MAPS_API_KEY;
	if (apiKey) {
		const viaPlace = placeName
			? await googlePlaceSearch(apiKey, placeName, lat, lng)
			: null;
		if (viaPlace?.address) return viaPlace;
		const viaReverse = await googleReverse(apiKey, lat, lng);
		if (viaReverse?.address) return viaReverse;
		// Google terpasang tapi tidak menemukan alamat jalan → tetap pakai
		// hasilnya kalau minimal kota/provinsinya ada.
		if (viaPlace ?? viaReverse) return (viaPlace ?? viaReverse) as GeoAddress;
	}
	// Tanpa API key: cari POI-nya dulu berdasarkan nama (alamat resmi venue),
	// baru jatuh ke reverse-geocode (jalan terdekat dari pin).
	const byName = placeName ? await osmPlaceSearch(placeName, lat, lng) : null;
	if (byName?.address) return byName;
	return osmReverse(lat, lng);
}
