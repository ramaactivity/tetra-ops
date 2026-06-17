"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: "trial", label: "Neraca Saldo" },
	{ value: "pnl", label: "Laba / Rugi" },
	{ value: "neraca", label: "Neraca" },
];

export function ReportsTabs({ current }: { current: string }) {
	const params = useSearchParams();

	function buildHref(value: string) {
		const next = new URLSearchParams(params.toString());
		if (value === "trial") next.delete("report");
		else next.set("report", value);
		const qs = next.toString();
		return `/finance/reports${qs ? `?${qs}` : ""}`;
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
							<span className="bg-[#059669] absolute inset-x-0 bottom-0 h-0.5" />
						)}
					</Link>
				);
			})}
		</nav>
	);
}
