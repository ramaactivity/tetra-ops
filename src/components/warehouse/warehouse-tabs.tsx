"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Warehouse navigation TABS = VIEWS (filtering data master).
 * Beda dari TOMBOL ATAS yg untuk ACTIONS/WORKFLOWS (Stock Opname, Pembelian, dll).
 *
 * Tabs dengan `path` di-handle sebagai pure navigasi ke halaman lain
 * (Bundle/Set → /warehouse/bundles). Tabs dengan `tab` query di-handle
 * sebagai filter di /warehouse main page.
 */
type Tab =
	| { kind: "query"; value: string; label: string }
	| { kind: "path"; path: string; matchPrefix: string; label: string };

const TABS: Tab[] = [
	{ kind: "query", value: "consumables", label: "Persediaan" },
	{ kind: "query", value: "fixed_asset", label: "Aset Tetap" },
	{ kind: "query", value: "market", label: "Market List" },
	{ kind: "query", value: "movements", label: "Log Mutasi" },
	{
		kind: "path",
		path: "/warehouse/bundles",
		matchPrefix: "/warehouse/bundles",
		label: "Bundle / Set",
	},
];

export function WarehouseTabs({ current }: { current: string }) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const isOnMainPage = pathname === "/warehouse";

	function buildHref(tab: Tab): string {
		if (tab.kind === "path") return tab.path;
		const params = new URLSearchParams(searchParams.toString());
		if (tab.value === "consumables") params.delete("tab");
		else params.set("tab", tab.value);
		const qs = params.toString();
		return qs ? `/warehouse?${qs}` : "/warehouse";
	}

	function isActive(tab: Tab): boolean {
		if (tab.kind === "path") return pathname.startsWith(tab.matchPrefix);
		// Query-based tab: must be on /warehouse main + tab matches
		return isOnMainPage && current === tab.value;
	}

	return (
		<nav className="border-border-default flex gap-1 overflow-x-auto border-b">
			{TABS.map((tab) => {
				const active = isActive(tab);
				const label = tab.label;
				return (
					<Link
						key={tab.kind === "path" ? tab.path : tab.value}
						href={buildHref(tab)}
						className={cn(
							"relative shrink-0 px-4 py-3 text-sm font-medium transition-colors",
							active
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{label}
						{active && (
							<span className="bg-primary absolute inset-x-0 bottom-0 h-0.5" />
						)}
					</Link>
				);
			})}
		</nav>
	);
}
