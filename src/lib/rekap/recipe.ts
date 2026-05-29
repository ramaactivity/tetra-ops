import type { RekapField } from "@/lib/rekap-mapping/types";

/**
 * recipe.ts — single source of truth untuk "konsumsi material per event":
 * daftar bucket HPP + mapping rekap_field → bucket + reducer bucketHpp().
 *
 * Resep kuantitas-nya sendiri (SIZE_RECIPE media/sleeve, ASSEMBLY_RULES) hidup
 * di planConsumption (src/lib/actions/rekap.ts → planRekapDeduction). Modul ini
 * fokus ke pemetaan & costing supaya HPP = nilai stok yang benar-benar keluar.
 *
 * Bucket keys cocok dengan kolom event_settlements.hpp_* dan output JSONB
 * calculate_recap_hpp lama, jadi snapshot ini drop-in untuk settle_event.
 */

export const HPP_BUCKETS = [
	"mediaset",
	"sleeve",
	"flashdisk",
	"pouch",
	"photomagnet",
	"keychain",
	"bonus",
	"other",
] as const;

export type HppBucket = (typeof HPP_BUCKETS)[number];

/** Per-bucket HPP (Rupiah, integer) + total. Shape = event_settlements.hpp_*. */
export type HppBreakdown = Record<HppBucket, number> & { total: number };

/**
 * Assembly / consumable rekap field → HPP bucket. media/sleeve & cetak_total
 * tidak di sini (di-handle eksplisit oleh planner: media→mediaset, sleeve→sleeve).
 */
export const FIELD_TO_BUCKET: Record<
	Exclude<RekapField, "cetak_total" | "media_set_used" | "sleeve_used">,
	HppBucket
> = {
	flashdisk_used: "flashdisk",
	pouch_used: "pouch",
	photomagnet_used: "photomagnet",
	keychain_used: "keychain",
};

export type CostedLine = { qty: number; unit_cost: number; bucket: HppBucket };

/**
 * Reduce costed consumption lines → per-bucket HPP. Uang di-round SEKALI per
 * bucket (bukan per line) supaya konsisten dengan posting jurnal integer dan
 * Dr=Cr tetap balance. total = jumlah bucket yang sudah di-round.
 *
 * Karena lines yang sama yang nge-generate stock_movements (qty × unit_cost),
 * hasilnya == nilai stok yang keluar (± <1 Rupiah per bucket karena rounding).
 */
export function bucketHpp(lines: readonly CostedLine[]): HppBreakdown {
	const raw: Record<HppBucket, number> = {
		mediaset: 0,
		sleeve: 0,
		flashdisk: 0,
		pouch: 0,
		photomagnet: 0,
		keychain: 0,
		bonus: 0,
		other: 0,
	};
	for (const l of lines) {
		raw[l.bucket] += (Number(l.qty) || 0) * (Number(l.unit_cost) || 0);
	}
	const out = { total: 0 } as HppBreakdown;
	let total = 0;
	for (const b of HPP_BUCKETS) {
		const rounded = Math.round(raw[b]);
		out[b] = rounded;
		total += rounded;
	}
	out.total = total;
	return out;
}
