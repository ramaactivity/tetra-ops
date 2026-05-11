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

type ResolveResult =
	| {
			ok: true;
			venue: string | null;
			address: string | null;
			city: string | null;
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

	// Reverse geocode via Nominatim (OSM) if we have coordinates
	let address: string | null = null;
	let city: string | null = null;
	if (lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)) {
		try {
			const geoRes = await fetch(
				`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id&zoom=18`,
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
				const parts = [
					addr.house_number,
					addr.road,
					addr.suburb || addr.neighbourhood,
				].filter(Boolean);
				if (parts.length > 0) address = parts.join(", ");
				city =
					addr.city ||
					addr.municipality ||
					addr.town ||
					addr.county ||
					null;
			}
		} catch {
			// Geocode failed — return whatever we parsed from URL alone
		}
	}

	return { ok: true, venue, address, city, lat, lng };
}
