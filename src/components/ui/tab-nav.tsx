"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * <TabNav /> — the ONE section sub-navigation pattern (Vercel/Linear sub-nav).
 *
 * Underline tabs on a full-width hairline baseline: active tab = ink text + a
 * 2px ink underline that overlaps the baseline; inactive = muted, with a faint
 * underline hint on hover. Pure text + hairline (no muddy fills) so it blends
 * with the app's hairline-heavy chrome and reads as the title bar of the
 * section below it.
 *
 * Use this for switching DATA VIEWS within one page (Warehouse: Persediaan /
 * Aset Tetap / …, Akuntansi: Bagan Akun / Jurnal). For switching major
 * views/routes from the page header, use the segmented `OperationsViewSwitcher`
 * pattern instead.
 *
 * Presentational only — callers compute hrefs + active state (keeps URL logic
 * local to each page) and pass the resolved items in.
 */
export type TabNavItem = {
	label: string;
	href: string;
	active: boolean;
	/** Optional muted count badge after the label. */
	count?: number;
};

export function TabNav({
	items,
	className,
	"aria-label": ariaLabel,
}: {
	items: ReadonlyArray<TabNavItem>;
	className?: string;
	"aria-label"?: string;
}) {
	return (
		<nav
			aria-label={ariaLabel}
			className={cn(
				"flex items-center gap-1 overflow-x-auto border-b border-border-default",
				className,
			)}
		>
			{items.map((tab) => (
				<Link
					key={`${tab.href}::${tab.label}`}
					href={tab.href}
					aria-current={tab.active ? "page" : undefined}
					className={cn(
						"group relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium leading-none transition-colors",
						tab.active
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{tab.label}
					{typeof tab.count === "number" && (
						<span
							className={cn(
								"rounded px-1 text-[11px] tabular-nums transition-colors",
								tab.active
									? "bg-secondary text-foreground"
									: "bg-secondary/60 text-muted-foreground",
							)}
						>
							{tab.count}
						</span>
					)}
					{/* Active underline — overlaps the baseline hairline, slightly
					    inset + rounded so it hugs the label, not the tab edge. */}
					<span
						aria-hidden
						className={cn(
							"absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground transition-opacity duration-200",
							tab.active
								? "opacity-100"
								: "opacity-0 group-hover:opacity-20",
						)}
					/>
				</Link>
			))}
		</nav>
	);
}
