"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: Array<{ value: string; label: string }> = [
	{ value: "consumables", label: "Consumables" },
	{ value: "equipment", label: "Alat & Gear" },
	{ value: "movements", label: "Log Mutasi" },
];

export function WarehouseTabs({ current }: { current: string }) {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	function buildHref(tab: string) {
		const params = new URLSearchParams(searchParams.toString());
		if (tab === "consumables") params.delete("tab");
		else params.set("tab", tab);
		const qs = params.toString();
		return qs ? `${pathname}?${qs}` : pathname;
	}

	return (
		<nav className="border-border-default flex gap-1 overflow-x-auto border-b">
			{TABS.map((tab) => {
				const isActive = current === tab.value;
				return (
					<Link
						key={tab.value}
						href={buildHref(tab.value)}
						className={cn(
							"relative shrink-0 px-4 py-3 text-sm font-medium transition-colors",
							isActive
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{tab.label}
						{isActive && (
							<span className="bg-primary absolute inset-x-0 bottom-0 h-0.5" />
						)}
					</Link>
				);
			})}
		</nav>
	);
}
