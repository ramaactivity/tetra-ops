import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * <KpiRow /> — the one KPI tile row every page shares (Operations is the
 * reference). Keeps stat cards uniform across the whole app.
 *
 * - **Mobile** (`< sm`): a horizontal-scroll carousel showing exactly 2 cards
 *   per view (`w-[calc(50%-0.375rem)]` paired with the `gap-3` gutter), snap-
 *   aligned, so the two visible cards sit FLUSH with the full-width sections
 *   above/below — their left/right edges line up. Swipe for any extras.
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
				"[&>*]:w-[calc(50%-0.375rem)] [&>*]:shrink-0 [&>*]:snap-start",
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
