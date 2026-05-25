/**
 * SKU + Asset Number auto-generation from item name.
 *
 * Pattern:
 *   Inventory: <PREFIX>-<SLUG-OF-NAME> → mis. "Mediaset Basic" → "MEDIA-BASIC"
 *              fallback prefix "ITM-" kalau tidak match known kategori.
 *   Fixed asset: AST-<SLUG-OF-NAME> → mis. "Canon EOS R6 Mark II" → "AST-CANON-EOS-R6"
 *
 * Slug rules:
 *   - Uppercase, ASCII letters + digits, separator "-"
 *   - Drop common stop words ("the", "and", "or", "of", "untuk", "dan", "atau")
 *   - Max 6 segments setelah prefix supaya tidak kepanjangan
 *   - Drop "II", "Mark", "Pro", "Plus" dst hanya kalau perlu shortening
 *
 * Pure function — tidak ada side effect. Server action akan cek uniqueness
 * dan suffix -2, -3, dst kalau collide.
 */

const STOP_WORDS = new Set([
	"the",
	"and",
	"or",
	"of",
	"for",
	"in",
	"on",
	"a",
	"an",
	"untuk",
	"dan",
	"atau",
	"yg",
	"yang",
	"ke",
	"di",
	"dari",
]);

/** Common inventory keyword → prefix lookup. */
const INVENTORY_PREFIX_HINTS: Array<{ pattern: RegExp; prefix: string }> = [
	{ pattern: /\b(mediaset|media\s*set|paper)\b/i, prefix: "MEDIA" },
	{ pattern: /\bsleeve\b/i, prefix: "SLEEVE" },
	{ pattern: /\b(flashdisk|usb|flash\s*drive)\b/i, prefix: "FLASHDISK" },
	{ pattern: /\b(pouch|kantong|tote\s*bag)\b/i, prefix: "POUCH" },
	{ pattern: /\b(magnet|photomagnet)\b/i, prefix: "PHOTOMAGNET" },
	{ pattern: /\b(keychain|gantungan)\b/i, prefix: "KEY" },
	{ pattern: /\b(box|kemasan)\b/i, prefix: "BOX" },
	{ pattern: /\b(strap|tali)\b/i, prefix: "STRAP" },
	{ pattern: /\b(frame|bingkai)\b/i, prefix: "FRAME" },
	{ pattern: /\b(tinta|ink|ribbon)\b/i, prefix: "INK" },
	{ pattern: /\b(lakban|tape)\b/i, prefix: "TAPE" },
];

/** Common fixed-asset keyword → prefix lookup. */
const FIXED_ASSET_PREFIX_HINTS: Array<{ pattern: RegExp; prefix: string }> = [
	{ pattern: /\b(camera|kamera|canon|nikon|sony|fujifilm)\b/i, prefix: "AST-CAM" },
	{ pattern: /\b(lens|lensa)\b/i, prefix: "AST-LENS" },
	{ pattern: /\b(printer|dnp|mitsubishi|hiti)\b/i, prefix: "AST-PRINTER" },
	{ pattern: /\b(light|lighting|godox|flash|strobe)\b/i, prefix: "AST-LIGHT" },
	{ pattern: /\b(tripod|monopod|stand)\b/i, prefix: "AST-STAND" },
	{ pattern: /\b(backdrop|background)\b/i, prefix: "AST-BACKDROP" },
	{ pattern: /\b(laptop|computer|pc)\b/i, prefix: "AST-PC" },
	{ pattern: /\b(monitor|display|tv)\b/i, prefix: "AST-MONITOR" },
	{ pattern: /\b(ipad|tablet)\b/i, prefix: "AST-TABLET" },
	{ pattern: /\b(cable|kabel)\b/i, prefix: "AST-CABLE" },
];

function slugify(text: string, maxSegments = 4): string {
	const cleaned = text
		.toUpperCase()
		.replace(/[^A-Z0-9\s-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!cleaned) return "ITEM";

	const segments = cleaned
		.split(/[\s-]+/)
		.filter((s) => s.length > 0)
		.filter((s) => !STOP_WORDS.has(s.toLowerCase()))
		.slice(0, maxSegments);

	return segments.length > 0 ? segments.join("-") : "ITEM";
}

export function generateInventorySku(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "";

	for (const { pattern, prefix } of INVENTORY_PREFIX_HINTS) {
		if (pattern.test(trimmed)) {
			// Use the rest of the name (after prefix-keyword) as slug
			const rest = trimmed.replace(pattern, "").trim();
			const slug = rest ? slugify(rest, 3) : "";
			return slug ? `${prefix}-${slug}` : prefix;
		}
	}

	// Fallback: ITM-<slug>
	return `ITM-${slugify(trimmed, 4)}`;
}

export function generateFixedAssetSku(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return "";

	for (const { pattern, prefix } of FIXED_ASSET_PREFIX_HINTS) {
		if (pattern.test(trimmed)) {
			const rest = trimmed.replace(pattern, "").trim();
			const slug = rest ? slugify(rest, 4) : "";
			return slug ? `${prefix}-${slug}` : prefix;
		}
	}

	// Fallback: AST-<slug>
	return `AST-${slugify(trimmed, 4)}`;
}

/**
 * Server-side uniqueness check. Tries the base SKU, then appends -2, -3, …
 * until unique. Up to 99 tries; throws after.
 */
export async function ensureUniqueSku(
	supabase: {
		from: (table: string) => {
			select: (cols: string) => {
				eq: (col: string, value: string) => {
					maybeSingle: () => Promise<{ data: unknown }>;
				};
			};
		};
	},
	baseSku: string,
): Promise<string> {
	let candidate = baseSku;
	for (let attempt = 1; attempt < 100; attempt++) {
		const { data } = await supabase
			.from("inventory_items")
			.select("id")
			.eq("sku", candidate)
			.maybeSingle();
		if (!data) return candidate;
		attempt++;
		candidate = `${baseSku}-${attempt}`;
	}
	throw new Error(`Tidak bisa generate SKU unik untuk "${baseSku}"`);
}
