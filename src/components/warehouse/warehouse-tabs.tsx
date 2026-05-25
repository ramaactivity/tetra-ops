"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Warehouse navigation TABS = VIEWS (filtering data master).
 * Beda dari TOMBOL ATAS yg untuk ACTIONS/WORKFLOWS (Stock Opname, Pembelian, dll).
 *
 * Style: pill-style segmented (tonal depth, no horizontal divider line).
 * Active = bg-surface-3 + rounded-md, inactive = muted text + hover.
 */
const TABS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: "consumables", label: "Persediaan" },
	{ value: "fixed_asset", label: "Aset Tetap" },
	{ value: "market", label: "Market List" },
	{ value: "movements", label: "Log Mutasi" },
	{ value: "bundles", label: "Bundle / Set" },
];

export function WarehouseTabs({ current }: { current: string }) {
	const searchParams = useSearchParams();

	function buildHref(tab: string): string {
		const params = new URLSearchParams(searchParams.toString());
		if (tab === "consumables") params.delete("tab");
		else params.set("tab", tab);
		const qs = params.toString();
		return qs ? `/warehouse?${qs}` : "/warehouse";
	}

	return (
		<nav
			className="inline-flex flex-wrap items-center gap-1 rounded-lg"
			aria-label="Warehouse views"
		>
			{TABS.map((tab) => {
				const isActive = current === tab.value;
				return (
					<Link
						key={tab.value}
						href={buildHref(tab.value)}
						className={cn(
							"rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200",
							isActive
								? "bg-surface-3 text-foreground"
								: "text-muted-foreground/70 hover:bg-surface-3/60 hover:text-foreground",
						)}
					>
						{tab.label}
					</Link>
				);
			})}
		</nav>
	);
}
