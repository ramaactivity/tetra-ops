/**
 * backfill-hpp-snapshot.ts — Phase 1 dari "One Canonical Consumption Engine".
 *
 * Isi crew_rekap.hpp_snapshot untuk rekap yang SUDAH approved (stock_committed)
 * tapi BELUM punya snapshot (di-approve sebelum Phase 0 deploy). Snapshot
 * di-derive dari stock_movements yang SUDAH ter-commit (bukan harga hari ini),
 * jadi snapshot == nilai stok yang benar-benar keluar saat itu.
 *
 * Bucket di-recover dari source_description (yang meng-encode source_label
 * "Rekap approved (<label>)"), fallback ke SKU map. Per-bucket split untuk
 * data lama bersifat best-effort; yang dijamin akurat adalah TOTAL (yang
 * dipakai net_profit).
 *
 * Usage:
 *   node --experimental-strip-types --env-file=.env.local --no-warnings \
 *     scripts/backfill-hpp-snapshot.ts [--dry]
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error(
		"❌ Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY",
	);
	process.exit(1);
}
const dry = process.argv.includes("--dry");
const sb = createClient(url, key, {
	auth: { autoRefreshToken: false, persistSession: false },
});

type Bucket =
	| "mediaset"
	| "sleeve"
	| "flashdisk"
	| "pouch"
	| "photomagnet"
	| "keychain"
	| "bonus"
	| "other";

const SKU_BUCKET: Record<string, Bucket> = {
	"MEDIA-BASIC": "mediaset",
	"MEDIA-PERF": "mediaset",
	"SLEEVE-4R": "sleeve",
	"SLEEVE-2R": "sleeve",
	"SLEEVE-PR": "sleeve",
	FLASHDISK: "flashdisk",
	"FD-BOX": "flashdisk",
	POUCH: "pouch",
	PHOTOMAGNET: "photomagnet",
	"KEY-FRAME": "keychain",
	"KEY-STRAP": "keychain",
};

/** Recover bucket from the source_label encoded in source_description. */
function bucketFromLabel(desc: string | null, sku: string | null): Bucket {
	const label = desc?.match(/\(([^)]*)\)\s*$/)?.[1] ?? "";
	if (label.startsWith("bonus:")) return "bonus";
	if (label.startsWith("extra:") || label.startsWith("bundle:")) return "other";
	if (label.startsWith("cetak_total")) return "mediaset";
	if (label.startsWith("sleeve_used")) return "sleeve";
	if (label.startsWith("flashdisk_used")) return "flashdisk";
	if (label.startsWith("keychain_used")) return "keychain";
	if (label.startsWith("pouch_used")) return "pouch";
	if (label.startsWith("photomagnet_used")) return "photomagnet";
	if (sku && SKU_BUCKET[sku]) return SKU_BUCKET[sku];
	return "other";
}

function emptyBuckets(): Record<Bucket, number> {
	return {
		mediaset: 0,
		sleeve: 0,
		flashdisk: 0,
		pouch: 0,
		photomagnet: 0,
		keychain: 0,
		bonus: 0,
		other: 0,
	};
}

async function main() {
	const { data: rekaps, error } = await sb
		.from("crew_rekap")
		.select("id, event_id")
		.not("stock_committed_at", "is", null)
		.is("hpp_snapshot", null)
		.eq("status", "reviewed");
	if (error) {
		console.error("❌ query crew_rekap:", error.message);
		process.exit(1);
	}
	console.log(`Found ${rekaps?.length ?? 0} approved rekap(s) without snapshot.`);

	let updated = 0;
	for (const r of rekaps ?? []) {
		const { data: moves, error: mErr } = await sb
			.from("stock_movements")
			.select(
				"quantity, unit_cost, source_description, item:inventory_items(sku)",
			)
			.eq("source", "rekap_consumption")
			.eq("source_id", r.event_id)
			.eq("direction", "out");
		if (mErr) {
			console.error(`  ⚠ ${r.event_id}: ${mErr.message}`);
			continue;
		}
		const raw = emptyBuckets();
		for (const m of moves ?? []) {
			const item = Array.isArray(m.item) ? m.item[0] : m.item;
			const b = bucketFromLabel(
				m.source_description as string | null,
				(item as { sku?: string } | null)?.sku ?? null,
			);
			raw[b] += (Number(m.quantity) || 0) * (Number(m.unit_cost) || 0);
		}
		let total = 0;
		const snapshot: Record<string, number> = {};
		for (const b of Object.keys(raw) as Bucket[]) {
			const rounded = Math.round(raw[b]);
			snapshot[b] = rounded;
			total += rounded;
		}
		snapshot.total = total;

		console.log(
			`  ${r.event_id}: total Rp ${total.toLocaleString("id-ID")} (${(moves ?? []).length} movements)`,
		);
		if (!dry) {
			const { error: uErr } = await sb
				.from("crew_rekap")
				.update({ hpp_snapshot: snapshot, hpp_snapshot_total: total })
				.eq("id", r.id);
			if (uErr) {
				console.error(`  ❌ update ${r.id}: ${uErr.message}`);
				continue;
			}
		}
		updated++;
	}
	console.log(
		dry
			? `\n[DRY] Would update ${updated} rekap(s).`
			: `\n✅ Updated ${updated} rekap(s).`,
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
