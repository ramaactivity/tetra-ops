"use server";

import { getCurrentUser } from "@/lib/auth/get-user";
import { resolveAddressAt } from "@/lib/geo/reverse-geocode";

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
	| "share_google" // Link share.google (kartu Search), bukan link Maps
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
			/** Dari mana alamatnya: data Google sendiri, atau perkiraan OSM. */
			source?: "google" | "osm";
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

	// Link "share.google" berasal dari tombol Bagikan di hasil Google Search,
	// bukan dari Google Maps. Halamannya dirender JavaScript dan tidak memuat
	// koordinat apa pun di HTML — tidak ada yang bisa diambil, jadi lebih baik
	// bilang terus terang cara mengambil link yang benar.
	const isShareGoogle =
		/^https?:\/\/share\.google\//i.test(trimmed) ||
		/^https?:\/\/(www\.)?google\.[a-z.]+\/search/i.test(finalUrl);
	if (isShareGoogle) {
		return {
			ok: true,
			reason: "share_google",
			venue: null,
			address: null,
			city: null,
			province: null,
			lat: null,
			lng: null,
		};
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

	// !3d/!4d = titik PIN tempatnya. @lat,lng cuma titik tengah layar peta saat
	// URL disalin — bisa meleset ratusan meter kalau peta sempat digeser. Jadi
	// pin didahulukan, @ hanya cadangan.
	const pinMatch = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
	const atMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
	const coordMatch = pinMatch ?? atMatch;
	if (coordMatch) {
		lat = Number.parseFloat(coordMatch[1]);
		lng = Number.parseFloat(coordMatch[2]);
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
		lat !== null &&
		lng !== null &&
		Number.isFinite(lat) &&
		Number.isFinite(lng);

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

	// Alamat: Google dulu (persis seperti kartu tempatnya) → OSM sebagai
	// cadangan. Lihat lib/geo/reverse-geocode.ts.
	const resolved = await resolveAddressAt(lat as number, lng as number, venue);
	const address = resolved?.address ?? null;
	const city = resolved?.city ?? null;
	const province = resolved?.province ?? null;
	const geocodeOk = Boolean(address || city);

	return {
		ok: true,
		reason: geocodeOk ? "ok" : "geocode_failed",
		venue,
		address,
		city,
		province,
		lat,
		lng,
		source: resolved?.source,
	};
}
