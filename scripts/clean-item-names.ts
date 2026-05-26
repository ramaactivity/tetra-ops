/**
 * clean-item-names.ts — Refactor item names:
 *   • Strip parenthetical descriptions → move to notes
 *   • Normalize title-case (Indonesian convention)
 *   • Trim whitespace
 *
 * Usage: node --experimental-strip-types --env-file=.env.local --no-warnings \
 *          scripts/clean-item-names.ts [--apply]
 */

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
	{ auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Indonesian Title Case — capitalize each word, preserve all-caps acronyms
 * (USB, DNP, 4R, 2R, HP, TNW), keep small connectors lowercase (dan, atau,
 * di, ke, dari, untuk).
 */
const SMALL_WORDS = new Set([
	"dan",
	"atau",
	"di",
	"ke",
	"dari",
	"untuk",
	"yang",
	"dengan",
	"pada",
	"oleh",
]);
const KEEP_UPPER = new Set([
	"USB",
	"DNP",
	"HP",
	"TNW",
	"DSLR",
	"LED",
	"AC",
	"DC",
	"PR",
	"4R",
	"2R",
	"SK400II",
	"VESA",
]);
const KEEP_LOWER = new Set(["mm", "cm", "kg", "g"]);

function titleCaseWord(w: string, idx: number): string {
	if (w === "") return w;
	const upper = w.toUpperCase();
	if (KEEP_UPPER.has(upper)) return upper;
	if (KEEP_LOWER.has(w.toLowerCase())) return w.toLowerCase();
	// Handle compound like "17-50mm" — split by non-letter
	if (/^\d/.test(w)) return w; // numbers / measurements stay as-is
	const lower = w.toLowerCase();
	if (idx > 0 && SMALL_WORDS.has(lower)) return lower;
	return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function titleCase(s: string): string {
	return s
		.split(/\s+/)
		.map((w, i) => titleCaseWord(w, i))
		.join(" ");
}

/**
 * Classify parenthetical content:
 *   • "variant"   = short subtype identifier (gold, merah, besar, kecil,
 *     vest hitam, horizontal, 4R/2R, Polaroid) → append to name to keep
 *     items distinguishable.
 *   • "description" = explanatory sentence (acrylic semua bentuk, USB drive
 *     butuh box terpisah, kemasan akhir ke klien) → move to notes column.
 */
const DESC_KEYWORDS =
	/\b(untuk|yang|akhir|butuh|semua|cuma|hanya|drive|dari|kemasan|warna|bentuk|tipe)\b/i;
function classifyParenthetical(content: string): "variant" | "description" {
	if (content.includes(",")) return "description";
	if (DESC_KEYWORDS.test(content)) return "description";
	if (content.split(/\s+/).length > 3) return "description";
	return "variant";
}

/**
 * Split "Name (paren)" → either:
 *   • { name: "Name Variant", desc: null }   (paren classified as variant)
 *   • { name: "Name", desc: "Paren text" }   (paren classified as description)
 */
function splitNameAndDesc(raw: string): { name: string; desc: string | null } {
	const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*(.*)$/);
	if (!m) return { name: raw.trim(), desc: null };
	const before = m[1].trim();
	const inside = m[2].trim();
	const after = m[3].trim();
	const kind = classifyParenthetical(inside);
	if (kind === "variant") {
		const merged = [before, inside, after].filter(Boolean).join(" ").trim();
		return { name: merged, desc: null };
	}
	const name = after ? `${before} ${after}`.trim() : before;
	return { name, desc: inside };
}

async function main() {
	const { data: items, error } = await sb
		.from("inventory_items")
		.select("id, sku, name, notes, category")
		.is("deleted_at", null)
		.order("category")
		.order("name");
	if (error || !items) {
		console.error("Fetch failed:", error);
		process.exit(1);
	}

	type Change = {
		id: string;
		sku: string;
		category: string;
		oldName: string;
		newName: string;
		oldNotes: string | null;
		newNotes: string | null;
		reason: string;
	};
	const changes: Change[] = [];

	for (const it of items) {
		const original = (it.name as string).trim();
		const split = splitNameAndDesc(original);
		const cleanedName = titleCase(split.name);

		// Merge any extracted desc into existing notes (don't lose user-edited notes)
		let newNotes = (it.notes as string | null) ?? null;
		if (split.desc) {
			const descCapitalized =
				split.desc.charAt(0).toUpperCase() + split.desc.slice(1);
			if (newNotes && !newNotes.toLowerCase().includes(split.desc.toLowerCase())) {
				newNotes = `${descCapitalized}. ${newNotes}`;
			} else if (!newNotes) {
				newNotes = descCapitalized;
			}
		}

		const reasons: string[] = [];
		if (cleanedName !== original) reasons.push("strip-paren + title-case");
		else if (cleanedName !== original) reasons.push("title-case");
		if (newNotes !== ((it.notes as string | null) ?? null))
			reasons.push("merge-desc-to-notes");

		if (cleanedName === original && newNotes === ((it.notes as string | null) ?? null))
			continue;

		changes.push({
			id: it.id as string,
			sku: it.sku as string,
			category: it.category as string,
			oldName: original,
			newName: cleanedName,
			oldNotes: (it.notes as string | null) ?? null,
			newNotes,
			reason: reasons.join(" + ") || "no-op",
		});
	}

	console.log("\n## Name Cleanup Preview\n");
	console.log(`Total items: ${items.length} · changes: ${changes.length}\n`);
	console.log("| SKU | Cat | Old name | → New name | Notes change |");
	console.log("|---|---|---|---|---|");
	for (const c of changes) {
		const notesDelta =
			c.oldNotes !== c.newNotes
				? `\`${c.oldNotes ?? "—"}\` → \`${c.newNotes}\``
				: "—";
		console.log(
			`| \`${c.sku}\` | ${c.category} | ${c.oldName} | → **${c.newName}** | ${notesDelta} |`,
		);
	}

	if (!APPLY) {
		console.log("\nDry-run. Re-run with --apply to execute.");
		return;
	}

	console.log("\n## Applying...");
	let ok = 0;
	let fail = 0;
	for (const c of changes) {
		const { error: updErr } = await sb
			.from("inventory_items")
			.update({ name: c.newName, notes: c.newNotes })
			.eq("id", c.id);
		if (updErr) {
			console.error(`  ${c.sku} FAIL: ${updErr.message}`);
			fail++;
		} else {
			ok++;
		}
	}
	console.log(`\nDone. ${ok} updated · ${fail} failed.`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
