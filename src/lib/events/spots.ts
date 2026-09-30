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
