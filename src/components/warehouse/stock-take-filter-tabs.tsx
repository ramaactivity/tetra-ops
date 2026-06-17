"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type FilterKey = "active" | "all" | "committed" | "cancelled";

const TABS: ReadonlyArray<{ key: FilterKey; label: string }> = [
	{ key: "active", label: "Aktif" },
	{ key: "all", label: "Semua" },
	{ key: "committed", label: "Committed" },
	{ key: "cancelled", label: "Cancelled" },
];

export function StockTakeFilterTabs({
	current,
	counts,
}: {
	current: FilterKey;
	counts: Record<FilterKey, number>;
}) {
	const params = useSearchParams();

	return (
		<div className="inline-flex items-center gap-1 rounded-lg border border-border-default bg-surface-2 p-1 text-fluid-caption">
			{TABS.map((t) => {
				const active = t.key === current;
				const nextParams = new URLSearchParams(params.toString());
				if (t.key === "active") {
					nextParams.delete("filter");
				} else {
					nextParams.set("filter", t.key);
				}
				const qs = nextParams.toString();
				const href = `/warehouse/stock-take${qs ? `?${qs}` : ""}`;
				return (
					<Link
						key={t.key}
						href={href}
						className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
							active
								? "bg-[#059669] text-white"
								: "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
						}`}
						aria-pressed={active}
					>
						{t.label}
						<span
							className={`tabular text-[10px] ${
								active ? "opacity-80" : "text-muted-foreground/70"
							}`}
						>
							{counts[t.key]}
						</span>
					</Link>
				);
			})}
		</div>
	);
}
