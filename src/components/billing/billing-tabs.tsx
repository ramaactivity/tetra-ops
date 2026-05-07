"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: Array<{ value: string; label: string }> = [
	{ value: "all", label: "Semua" },
	{ value: "unpaid", label: "Unpaid" },
	{ value: "dp_partial", label: "DP / Partial" },
	{ value: "paid", label: "Lunas" },
	{ value: "overdue", label: "Overdue" },
];

export function BillingTabs({
	current,
	counts,
}: {
	current: string;
	counts: Record<string, number>;
}) {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	function buildHref(tab: string) {
		const params = new URLSearchParams(searchParams.toString());
		if (tab === "all") params.delete("tab");
		else params.set("tab", tab);
		const qs = params.toString();
		return qs ? `${pathname}?${qs}` : pathname;
	}

	return (
		<nav className="border-border-default flex gap-1 overflow-x-auto border-b">
			{TABS.map((tab) => {
				const isActive = current === tab.value;
				const count = counts[tab.value];
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
						<span>{tab.label}</span>
						{count !== undefined && count > 0 && (
							<span
								className={cn(
									"ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular",
									isActive
										? "bg-primary text-primary-foreground"
										: "bg-muted text-muted-foreground",
								)}
							>
								{count}
							</span>
						)}
						{isActive && (
							<span className="bg-primary absolute inset-x-0 bottom-0 h-0.5" />
						)}
					</Link>
				);
			})}
		</nav>
	);
}
