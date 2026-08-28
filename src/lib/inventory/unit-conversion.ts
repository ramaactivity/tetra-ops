/**
 * Multi-tier unit conversion helper.
 *
 * `inventory_items.unit_conversion` is stored as JSONB in one of two shapes:
 *
 * 1. Legacy (pre-2026-05-25): flat map of unit_code → multiplier.
 *      { "roll": 1, "lembar_4r": 700, "lembar_2r": 1400 }
 *    The numeric meaning is ambiguous (depends on whether the alt unit is
 *    bigger or smaller than the base), which led to inconsistent math
 *    across consumers. Still supported via parseLegacyConversion below.
 *
 * 2. v2 (2026-05-25+): explicit shape with kind classification and
 *    unambiguous multiplier semantics — see UnitConversionMap.
 *
 * Always use `toBase` / `fromBase` / `sumBundles` from this module instead
 * of doing ad-hoc multiplication elsewhere.
 */

export type UnitKind = "purchase" | "base" | "consumption";

export type UnitDef = {
	/** How many BASE units equal 1 of this unit. e.g. for SLEEVE pack: 1000. */
	multiplier: number | null;
	/**
	 * Reverse-direction denominator for high-precision capacity display.
	 * For MEDIA-BASIC lembar_4r: 700 (meaning 1 roll = 700 lembar 4R, so
	 * 1 lembar = 1/700 roll). When both are present, denominator is used
	 * for conversion so rounding stays exact across round-trips.
	 */
	denominator: number | null;
	kind: UnitKind;
	label: string;
};

export type UnitConversionMap = {
	base_unit: string;
	units: Record<string, UnitDef>;
};

export type Bundle = {
	qty: number;
	unit: string;
	note?: string | null;
};

/**
 * v2 shape detector. Legacy JSONB is a flat `Record<string, number>`;
 * v2 always has a `base_unit` string and a `units` object.
 */
export function isV2Shape(raw: unknown): raw is UnitConversionMap {
	if (!raw || typeof raw !== "object") return false;
	const obj = raw as Record<string, unknown>;
	return typeof obj.base_unit === "string" && typeof obj.units === "object";
}

/**
 * Normalize either legacy or v2 JSONB into v2 shape.
 *
 * For legacy, we infer:
 *   - base_unit = the key whose value === 1 (or `fallbackBaseUnit` if none)
 *   - non-base keys: depends on whether item's base unit is the BIG end
 *     (roll → smaller print units) or the SMALL end (pcs → larger pack):
 *       - if value > 1, treat as "1 base = value of this unit" → denominator
 *       - if value < 1, treat as "1 of this unit = value bases" → multiplier
 *     This matches the historical mixed semantics (SLEEVE pack:100 meant
 *     "1 pack = 100 pcs", MEDIA lembar_4r:700 meant "1 roll = 700 lembar").
 *
 *   Practical rule for legacy migration: assume value > 1 with the base
 *   unit having `unit === "roll"` (or similar "big" unit) means denominator;
 *   for pcs-based items it means multiplier. The caller passes the item's
 *   base unit string so we can disambiguate; if base is "roll", "set",
 *   "box" we treat alt as smaller (denominator); else as larger (multiplier).
 */
const BIG_BASE_UNITS = new Set(["roll", "set", "box", "drum", "tube"]);

export function parseLegacyConversion(
	legacy: Record<string, number> | null,
	fallbackBaseUnit: string,
): UnitConversionMap {
	const baseUnit =
		legacy && Object.entries(legacy).find(([, v]) => Number(v) === 1)?.[0]
			? Object.entries(legacy).find(([, v]) => Number(v) === 1)![0]
			: fallbackBaseUnit;

	const units: Record<string, UnitDef> = {};
	const baseIsBig = BIG_BASE_UNITS.has(baseUnit);

	if (!legacy || Object.keys(legacy).length === 0) {
		units[baseUnit] = {
			multiplier: 1,
			denominator: 1,
			kind: "base",
			label: baseUnit,
		};
		return { base_unit: baseUnit, units };
	}

	for (const [code, rawVal] of Object.entries(legacy)) {
		const val = Number(rawVal);
		if (code === baseUnit) {
			units[code] = {
				multiplier: 1,
				denominator: 1,
				kind: "base",
				label: code,
			};
			continue;
		}
		if (!Number.isFinite(val) || val === 0) continue;

		// Big-base (roll → lembar): alt is smaller, value = how many alts per 1 base
		// → denominator semantics; 1 alt = 1/value base. Mark as consumption.
		if (baseIsBig && val > 1) {
			units[code] = {
				multiplier: null,
				denominator: val,
				kind: "consumption",
				label: code,
			};
			continue;
		}
		// Small-base (pcs → pack): alt is bigger, value = how many bases per 1 alt
		// → multiplier semantics; 1 alt = value base. Mark as purchase.
		units[code] = {
			multiplier: val,
			denominator: null,
			kind: val >= 1 ? "purchase" : "consumption",
			label: code,
		};
	}

	return { base_unit: baseUnit, units };
}

/** Read JSONB (either legacy or v2 shape) and return normalized v2 shape. */
export function normalizeConversion(
	raw: unknown,
	fallbackBaseUnit: string,
): UnitConversionMap {
	if (isV2Shape(raw)) {
		// Ensure base unit row exists
		const map = raw;
		if (!map.units[map.base_unit]) {
			map.units[map.base_unit] = {
				multiplier: 1,
				denominator: 1,
				kind: "base",
				label: map.base_unit,
			};
		}
		return map;
	}
	return parseLegacyConversion(
		(raw ?? null) as Record<string, number> | null,
		fallbackBaseUnit,
	);
}

/** Convert a quantity in `unitCode` to the map's base unit. */
export function toBase(
	qty: number,
	unitCode: string,
	map: UnitConversionMap,
): number {
	if (!Number.isFinite(qty)) return 0;
	const unit = map.units[unitCode];
	if (!unit) {
		throw new Error(
			`Unit "${unitCode}" tidak terdaftar (base=${map.base_unit})`,
		);
	}
	if (unit.denominator != null && unit.denominator !== 0) {
		return qty / unit.denominator;
	}
	if (unit.multiplier != null) {
		return qty * unit.multiplier;
	}
	throw new Error(
		`Unit "${unitCode}" tidak punya multiplier maupun denominator`,
	);
}

/** Convert a base-unit quantity to display in `unitCode`. */
export function fromBase(
	qtyBase: number,
	unitCode: string,
	map: UnitConversionMap,
): number {
	if (!Number.isFinite(qtyBase)) return 0;
	const unit = map.units[unitCode];
	if (!unit) {
		throw new Error(
			`Unit "${unitCode}" tidak terdaftar (base=${map.base_unit})`,
		);
	}
	if (unit.denominator != null) {
		return qtyBase * unit.denominator;
	}
	if (unit.multiplier != null && unit.multiplier !== 0) {
		return qtyBase / unit.multiplier;
	}
	throw new Error(
		`Unit "${unitCode}" tidak punya multiplier maupun denominator`,
	);
}

/** Sum a list of (qty, unit) bundles into base-unit total. Invalid entries skipped. */
export function sumBundles(bundles: Bundle[], map: UnitConversionMap): number {
	let total = 0;
	for (const b of bundles) {
		if (!b || !b.unit) continue;
		const qty = Number(b.qty);
		if (!Number.isFinite(qty) || qty === 0) continue;
		try {
			total += toBase(qty, b.unit, map);
		} catch {
			// Skip entries with unknown units; UI should prevent these.
		}
	}
	return total;
}

/** Strip "(N base)" parenthetical dari label saat render — defensive against
 * legacy stored labels yang masih polluted. New saves sudah pakai clean label
 * via items-inventory.ts buildConversionJsonb. */
function sanitizeLabel(label: string): string {
	return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label;
}

/** List units filtered by kind, in stable order (base first, then by label). */
export function listUnitsByKind(
	map: UnitConversionMap,
	...kinds: UnitKind[]
): Array<{ code: string; def: UnitDef }> {
	const allowed = new Set(kinds);
	const entries = Object.entries(map.units)
		.filter(([, def]) => allowed.has(def.kind))
		.map(([code, def]) => ({
			code,
			def: { ...def, label: sanitizeLabel(def.label) },
		}));
	entries.sort((a, b) => {
		if (a.def.kind === "base" && b.def.kind !== "base") return -1;
		if (b.def.kind === "base" && a.def.kind !== "base") return 1;
		return a.def.label.localeCompare(b.def.label);
	});
	return entries;
}

/**
 * Satuan yang masuk akal dipakai saat MEMBELI: satuan beli + satuan dasar.
 *
 * Satuan pemakaian (mis. "lembar", denominator 1400) sengaja dikecualikan —
 * memasukkan harga "per lembar" di form pembelian membuat biaya per satuan
 * dasar jadi ngawur. Fallback ke seluruh satuan input dipakai untuk item yang
 * (karena salah konfigurasi) tidak punya satu pun satuan beli/dasar, supaya
 * pemilihnya tidak pernah kosong sama sekali.
 */
export function listPurchaseUnits(
	map: UnitConversionMap,
): Array<{ code: string; def: UnitDef }> {
	const buyable = listUnitsByKind(map, "purchase", "base");
	return buyable.length > 0 ? buyable : listInputUnits(map);
}

/** All input-friendly units (purchase + base + consumption) for opname bundles. */
export function listInputUnits(
	map: UnitConversionMap,
): Array<{ code: string; def: UnitDef }> {
	return listUnitsByKind(map, "purchase", "base", "consumption");
}

/**
 * Build the alt-unit capacity breakdown of a base-unit quantity, e.g.
 *   `formatCapacity(2.5, map)` for MEDIA-BASIC →
 *     [{ code: "lembar_4r", label: "Lembar 4R", value: 1750 }, ...]
 * Useful for the "≈ 1.750 lembar 4R · 3.500 lembar 2R" line under the
 * primary stock figure.
 */
export function listCapacityBreakdown(
	qtyBase: number,
	map: UnitConversionMap,
): Array<{ code: string; label: string; value: number }> {
	const out: Array<{ code: string; label: string; value: number }> = [];
	for (const [code, def] of Object.entries(map.units)) {
		if (def.kind !== "consumption") continue;
		try {
			out.push({
				code,
				label: def.label,
				value: fromBase(qtyBase, code, map),
			});
		} catch {
			// skip
		}
	}
	return out;
}
