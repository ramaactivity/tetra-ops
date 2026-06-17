import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * <KpiRow /> — the one KPI tile row every page shares (Operations is the
 * reference). Keeps stat cards uniform across the whole app.
 *
 * - **Mobile** (`< sm`): a tidy horizontal-scroll carousel — ~2 cards per view
 *   (`w-[47%]`), snap-aligned, inside the page gutter so the edges stay neat
 *   (not flush). Saves vertical space vs full-width stacked cards.
 * - **Desktop** (`sm+`): equal-width grid (2 cols, then 4 at `lg`).
 *
 * Child widths/snap are applied via `[&>*]`, so any <KpiCard> children just work
 * — no per-card classes needed. Override the desktop column count by passing a
 * `lg:grid-cols-N` class (e.g. operations uses 5).
 */

interface KpiRowProps {
	children: ReactNode;
	className?: string;
}

export function KpiRow({ children, className }: KpiRowProps) {
	return (
		<dl
			className={cn(
				"hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1",
				"[&>*]:w-[78%] [&>*]:shrink-0 [&>*]:snap-start",
				"sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:pb-0 sm:[&>*]:w-auto",
				"lg:grid-cols-4",
				className,
			)}
			data-slot="kpi-row"
		>
			{children}
		</dl>
	);
}
