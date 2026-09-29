/**
 * Jam tambahan di luar durasi paket — add-on "Tambahan Durasi" (time_extras),
 * baik dibeli (event_addons) maupun bonus gratis (event_bonuses). Contoh:
 * paket 2 jam + bonus 1 jam → booth jalan 3 jam, jam selesai = mulai + 3.
 * "Break Time" (time_extras juga) BUKAN tambahan durasi.
 */

type AddonLike = {
	name?: string | null;
	unit?: string | null;
	category?: string | null;
};

export function isExtraDurationAddon(a: AddonLike | null | undefined): boolean {
	return a?.category === "time_extras" && /durasi/i.test(a.name ?? "");
}

/** Total jam dari baris add-on/bonus: qty × jam per unit ("1 Jam" → 1). */
export function extraHoursOf(
	rows: Array<{ quantity: number; addon: AddonLike | null | undefined }>,
): number {
	let total = 0;
	for (const r of rows) {
		if (!isExtraDurationAddon(r.addon)) continue;
		const perUnit = Number(
			/(\d+(?:[.,]\d+)?)\s*jam/i
				.exec(r.addon?.unit ?? "")?.[1]
				?.replace(",", ".") ?? 1,
		);
		total += (Number(r.quantity) || 0) * (perUnit || 1);
	}
	return total;
}

/** "2 jam" · "2 jam + 1 jam bonus (total 3 jam)". */
export function durationLabel(
	packageHours: number | null | undefined,
	bonusHours: number,
	paidExtraHours = 0,
): string | null {
	if (!packageHours) return null;
	const extra = bonusHours + paidExtraHours;
	if (extra <= 0) return `${packageHours} jam`;
	const parts = [`${packageHours} jam paket`];
	if (paidExtraHours > 0) parts.push(`${paidExtraHours} jam tambahan`);
	if (bonusHours > 0) parts.push(`${bonusHours} jam bonus`);
	return `${parts.join(" + ")} (total ${packageHours + extra} jam)`;
}
