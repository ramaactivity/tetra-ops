/**
 * Event multi-unit (2–3 spot photobooth di satu acara) — satu tempat untuk
 * membaca spot, supaya digest, WA, crew app, dan cek "belum lengkap" tidak
 * masing-masing menebak.
 *
 * Spot 1 = kolom event biasa (frame_size, backdrop_id). Spot ≥2 = override di
 * events.spots; frame kosong berarti "sama dengan spot 1", backdrop kosong
 * berarti menyusul (tiap spot butuh backdrop fisik sendiri).
 *
 * Modul polos (bukan "use server") supaya bisa diimpor server maupun client.
 */

import { parseHHMM } from "@/lib/availability";

export type SpotOverride = {
	spot: number;
	frame_size: string | null;
	backdrop_id: string | null;
};

export type SpotSource = {
	unit_count?: number | null;
	spots?: unknown;
	frame_size?: string | null;
	backdrop_id?: string | null;
};

export type ResolvedSpot = {
	spot: number;
	frame_size: string | null;
	backdrop_id: string | null;
};

export function unitCountOf(ev: SpotSource): number {
	return Math.min(3, Math.max(1, Number(ev.unit_count ?? 1) || 1));
}

/** Semua spot event (1..unit_count) dengan frame & backdrop yang berlaku. */
export function eventSpots(ev: SpotSource): ResolvedSpot[] {
	const overrides = (Array.isArray(ev.spots) ? ev.spots : []) as SpotOverride[];
	return Array.from({ length: unitCountOf(ev) }, (_, i) => {
		const spot = i + 1;
		if (spot === 1) {
			return {
				spot,
				frame_size: ev.frame_size ?? null,
				backdrop_id: ev.backdrop_id ?? null,
			};
		}
		const o = overrides.find((x) => x?.spot === spot);
		return {
			spot,
			frame_size: o?.frame_size || ev.frame_size || null,
			backdrop_id: o?.backdrop_id ?? null,
		};
	});
}

/** Ukuran frame berbeda yang dipakai event ini (urut per spot, tanpa kosong). */
export function frameSizesOf(ev: SpotSource): string[] {
	return [
		...new Set(
			eventSpots(ev)
				.map((s) => s.frame_size)
				.filter((f): f is string => Boolean(f)),
		),
	];
}

/** "4R Unlimited 3 Jam" → "4R Unlimited 3 Jam × 2 unit" (1 unit: apa adanya). */
export function withUnits(name: string, units: number): string {
	return units > 1 ? `${name} × ${units} unit` : name;
}

/** Spot yang belum punya lead. Event 1 unit: [1] kalau belum ada lead sama sekali. */
export function spotsWithoutLead(
	units: number,
	crew: Array<{ role_in_event: string | null; spot_no?: number | null }>,
): number[] {
	return Array.from({ length: units }, (_, i) => i + 1).filter(
		(n) =>
			!crew.some(
				(c) =>
					c.role_in_event === "lead" && Math.min(units, c.spot_no ?? 1) === n,
			),
	);
}

/** Backdrop yang dipakai event ini (semua spot), dengan jumlah pemakaiannya. */
export function backdropUsage(ev: SpotSource): Map<string, number> {
	const used = new Map<string, number>();
	for (const sp of eventSpots(ev)) {
		if (sp.backdrop_id) {
			used.set(sp.backdrop_id, (used.get(sp.backdrop_id) ?? 0) + 1);
		}
	}
	return used;
}

type Window = {
	setup_time?: string | null;
	start_time?: string | null;
	end_time?: string | null;
};

/**
 * Dua event di tanggal sama bentrok memakai barang fisik yang sama? Jendela =
 * setup (atau mulai) s/d selesai. Jam yang belum diisi dianggap bentrok —
 * lebih aman ditanyakan daripada backdrop ter-booking dobel.
 */
export function windowsOverlap(a: Window, b: Window): boolean {
	const aStart = parseHHMM(a.setup_time) ?? parseHHMM(a.start_time);
	const aEnd = parseHHMM(a.end_time);
	const bStart = parseHHMM(b.setup_time) ?? parseHHMM(b.start_time);
	const bEnd = parseHHMM(b.end_time);
	if (aStart == null || aEnd == null || bStart == null || bEnd == null) {
		return true;
	}
	return aStart < bEnd && bStart < aEnd;
}

/**
 * Spot ≥2 yang ukurannya beda dari spot 1 → butuh file desain sendiri.
 * `spot1Frame` boleh diisi ukuran spot 1 yang BARU (koreksi saat ACC): spot
 * yang override-nya kosong ikut spot 1, jadi tidak butuh file terpisah.
 */
export function spotsNeedingOwnDesign(
	ev: SpotSource,
	spot1Frame: string | null = ev.frame_size ?? null,
): Array<{ spot: number; size: string }> {
	return eventSpots({ ...ev, frame_size: spot1Frame }).flatMap((sp) =>
		sp.spot > 1 && sp.frame_size && spot1Frame && sp.frame_size !== spot1Frame
			? [{ spot: sp.spot, size: sp.frame_size }]
			: [],
	);
}
