"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type FilterKey = "active" | "all" | "committed" | "cancelled";

const TABS: ReadonlyArray<{ key: FilterKey; label: string }> = [
	{ key: "active", label: "Berjalan" },
	{ key: "all", label: "Semua" },
	{ key: "committed", label: "Selesai" },
	{ key: "cancelled", label: "Dibatalkan" },
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
		<div className="inline-flex h-8 items-center gap-0.5 rounded-full border border-border-subtle bg-card p-0.5 shadow-[var(--shadow-level-1)]">
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
						className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
							active
								? "bg-[#059669] text-white"
								: "text-muted-foreground hover:bg-secondary hover:text-foreground"
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
