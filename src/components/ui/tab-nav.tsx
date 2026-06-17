"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * <TabNav /> — the ONE section sub-navigation pattern (UpGradely segmented pill).
 *
 * A soft-gray pill rail; the active tab lifts onto a white pill with a soft
 * shadow + ink text, inactive tabs are ghost/muted. Mirrors the view-switcher
 * and filter chips so all tab-like controls read as one family.
 *
 * Use this for switching DATA VIEWS within one page (Warehouse: Persediaan /
 * Aset Tetap / …, Akuntansi: Bagan Akun / Jurnal).
 *
 * Presentational only — callers compute hrefs + active state (keeps URL logic
 * local to each page) and pass the resolved items in.
 */
export type TabNavItem = {
	label: string;
	href: string;
	active: boolean;
	/** Optional leading icon, passed as a rendered element (RSC-safe). */
	icon?: ReactNode;
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
				"hide-scrollbar inline-flex h-10 max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border-subtle bg-card p-1 shadow-[var(--shadow-level-1)]",
				className,
			)}
		>
			{items.map((tab) => (
				<Link
					key={`${tab.href}::${tab.label}`}
					href={tab.href}
					aria-current={tab.active ? "page" : undefined}
					className={cn(
						"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium leading-none transition-colors",
						tab.active
							? "bg-[#059669] text-white"
							: "text-muted-foreground hover:bg-secondary hover:text-foreground",
					)}
				>
					{tab.icon}
					{tab.label}
					{typeof tab.count === "number" && (
						<span
							className={cn(
								"rounded-full px-1.5 text-[11px] tabular-nums transition-colors",
								tab.active
									? "bg-white/20 text-white"
									: "bg-secondary text-muted-foreground",
							)}
						>
							{tab.count}
						</span>
					)}
				</Link>
			))}
		</nav>
	);
}
