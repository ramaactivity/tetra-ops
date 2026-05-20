"use client";

/**
 * Back-compat shim — the canonical primitive now lives at
 * `src/components/operations/_shared/summary-rail.tsx` as
 * <SummaryRail>. This file re-exports the new component under the
 * old <SummaryPanel> name + the old SummaryPanelProps type so
 * existing booking-form imports keep working until Phase 1.5 of
 * the operations-consistency pass swaps to the new path.
 */

export {
	SummaryRail as SummaryPanel,
	type SummaryRailProps as SummaryPanelProps,
	type AddonLine,
} from "@/components/operations/_shared/summary-rail";
