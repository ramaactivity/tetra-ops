/**
 * Frame-size-aware mapping resolver.
 *
 * rekap_field_mapping table can have multiple rows per rekap_field, each
 * keyed on (rekap_field, frame_size). Pure resolution logic:
 *
 *   1. Try to find a row matching (field, frame_size) exactly.
 *   2. If not found, fall back to the row with frame_size = '' (default).
 *   3. If neither exists, return null (unmapped).
 *
 * Pure function — no I/O. Used by server (planRekapDeduction,
 * getAutoHpp) and client (rekap form live preview) so numbers stay
 * consistent.
 */

import type { RekapField } from "@/lib/rekap-mapping/types";

export type MappingRow = {
	rekap_field: RekapField;
	frame_size: string; // '' = default, or '4R' / '2R' / 'polaroid' / 'none'
	item_id: string | null;
	qty_per_unit: number;
	is_active: boolean;
};

/**
 * Find the most-specific mapping for (field, frameSize). Returns null
 * when no match (including no default fallback) or when the matching
 * row is inactive.
 */
export function resolveMapping(
	field: RekapField,
	frameSize: string,
	mappings: MappingRow[],
): MappingRow | null {
	// 1. Exact match on frame_size
	const exact = mappings.find(
		(m) =>
			m.rekap_field === field &&
			m.frame_size === frameSize &&
			m.is_active,
	);
	if (exact) return exact;

	// 2. Fallback to default ('')
	const fallback = mappings.find(
		(m) => m.rekap_field === field && m.frame_size === "" && m.is_active,
	);
	return fallback ?? null;
}

/**
 * Resolve all active mappings for an event, keyed by rekap_field.
 * Useful when caller wants a map for quick lookup during cost compute.
 */
export function resolveAllMappings(
	frameSize: string,
	mappings: MappingRow[],
): Map<RekapField, MappingRow> {
	const result = new Map<RekapField, MappingRow>();
	const fields = new Set(mappings.map((m) => m.rekap_field));
	for (const field of fields) {
		const m = resolveMapping(field, frameSize, mappings);
		if (m) result.set(field, m);
	}
	return result;
}
