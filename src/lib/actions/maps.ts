"use server";

import { getCurrentUser } from "@/lib/auth/get-user";

/**
 * resolveMapsUrl — given a Google Maps share URL, follow redirects,
 * parse place name + coordinates, and reverse-geocode via OpenStreetMap
 * Nominatim (free, no API key, but ~1 req/sec global limit).
 *
 * Tetra Ops use case: owner pins lokasi venue di Google Maps, copy
 * share URL, paste ke form. App auto-fill venue + alamat + kota
 * tanpa harus ngetik manual.
 *
 * Manual override tetap bisa — server hanya returns suggested values,
 * client decides whether to apply.
 */

type ResolveReason =
	| "search_only" // URL masih halaman search, belum pinpoint venue
	| "no_coordinates" // URL tidak punya pattern @lat,lng atau !3d!4d
	| "geocode_failed" // Punya koordinat tapi reverse-geocode gagal
	| "ok"; // Berhasil ekstrak alamat/kota

type ResolveResult =
	| {
			ok: true;
			reason: ResolveReason;
			venue: string | null;
			address: string | null;
			city: string | null;
			province: string | null;
			lat: number | null;
			lng: number | null;
	  }
	| { ok: false; error: string };

export async function resolveMapsUrl(url: string): Promise<ResolveResult> {
	const me = await getCurrentUser();
	if (!me) return { ok: false, error: "Unauthorized" };

	const trimmed = url.trim();
	if (!trimmed || !/^https?:\/\//.test(trimmed)) {
		return { ok: false, error: "URL tidak valid (harus http/https)" };
	}

	// Follow redirects to get the full URL
	let finalUrl = trimmed;
	try {
		const res = await fetch(trimmed, {
			method: "GET",
			redirect: "follow",
			headers: { "User-Agent": "TetraOps/1.0 (tetra-ops.vercel.app)" },
		});
		finalUrl = res.url;
	} catch {
		// Use original URL — parse may still work if URL already expanded
	}

	// Detect search-only URL (user clicked "Cari di Maps" tapi belum pinpoint
	// venue di hasil). Pattern: /maps/search/ atau /maps?q=...
	const isSearchOnly =
		/\/maps\/search\//i.test(finalUrl) ||
		/^https?:\/\/[^/]+\/maps\?[^/]*q=/i.test(finalUrl);

	// Parse coordinates from URL — Google Maps formats:
	//   /@-6.59,106.79,17z/
	//   /place/Name/@-6.59,106.79,17z
	//   /!3d-6.59!4d106.79 (legacy)
	let lat: number | null = null;
	let lng: number | null = null;

	const atMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
	if (atMatch) {
		lat = Number.parseFloat(atMatch[1]);
		lng = Number.parseFloat(atMatch[2]);
	} else {
		const bangMatch = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
		if (bangMatch) {
			lat = Number.parseFloat(bangMatch[1]);
			lng = Number.parseFloat(bangMatch[2]);
		}
	}

	// Parse venue name from URL path: /place/Venue+Name/...
	let venue: string | null = null;
	const placeMatch = finalUrl.match(/\/place\/([^/@?]+)/);
	if (placeMatch) {
		try {
			venue = decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim();
		} catch {
			venue = null;
		}
	}

	// Early exit kalau tidak ada koordinat — kasih reason yang spesifik
	const hasCoords =
		lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

	if (!hasCoords) {
		return {
			ok: true,
			reason: isSearchOnly ? "search_only" : "no_coordinates",
			venue,
			address: null,
			city: null,
			province: null,
			lat: null,
			lng: null,
		};
	}

	// Reverse geocode via Nominatim (OSM)
	let address: string | null = null;
	let city: string | null = null;
	let province: string | null = null;
	let geocodeOk = false;
	try {
		const geoRes = await fetch(
			`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id&zoom=18&addressdetails=1`,
			{
				headers: {
					"User-Agent": "TetraOps/1.0 (tetra-ops.vercel.app)",
				},
			},
		);
		if (geoRes.ok) {
			const geoData = (await geoRes.json()) as {
				address?: Record<string, string>;
			};
			const addr = geoData.address ?? {};

			// Alamat: street-level + konteks geografis (kelurahan/desa)
			// Nominatim field mapping untuk Indonesia bervariasi — ambil sebanyak
			// mungkin tanpa overlap sama kota/kabupaten/provinsi.
			const addressParts = [
				addr.house_number,
				addr.road,
				addr.neighbourhood || addr.suburb || addr.hamlet,
				addr.village || addr.town,
			].filter(Boolean);
			// Dedupe sequential identical parts (cth. road == neighbourhood)
			const dedupedAddress: string[] = [];
			for (const part of addressParts) {
				if (dedupedAddress[dedupedAddress.length - 1] !== part) {
					dedupedAddress.push(part);
				}
			}
			if (dedupedAddress.length > 0) address = dedupedAddress.join(", ");

			// Kota / Kabupaten resolution:
			// Untuk daerah urban (Jakarta, Bandung) Nominatim isi `city`.
			// Untuk daerah peri-urban/rural (Kab. Bogor), `city` kosong tapi
			// `state_district` atau `county` berisi kabupaten. Prioritaskan
			// state_district karena lebih konsisten = level admin 4 (kab/kota).
			const cityCandidate =
				addr.city ||
				addr.town ||
				addr.municipality ||
				addr.state_district ||
				addr.county ||
				null;
			if (cityCandidate) {
				// Normalize: "Bogor Regency" (English) → "Kabupaten Bogor" (ID)
				if (/\bRegency\b/i.test(cityCandidate)) {
					city = `Kabupaten ${cityCandidate.replace(/\bRegency\b/i, "").trim()}`;
				} else {
					city = cityCandidate;
				}
			}

			// Provinsi
			province = addr.state || null;
			// Normalize "West Java" → "Jawa Barat" untuk konsistensi UI ID
			if (province) {
				const provinceMap: Record<string, string> = {
					"west java": "Jawa Barat",
					"central java": "Jawa Tengah",
					"east java": "Jawa Timur",
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
				const norm = provinceMap[province.toLowerCase()];
				if (norm) province = norm;
			}

			geocodeOk = Boolean(address || city);
		}
	} catch {
		// Geocode failed — return whatever we parsed from URL alone
	}

	return {
		ok: true,
		reason: geocodeOk ? "ok" : "geocode_failed",
		venue,
		address,
		city,
		province,
		lat,
		lng,
	};
}
