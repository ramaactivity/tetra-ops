"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export type PayablesStatusFilter =
	| "outstanding"
	| "open"
	| "partial"
	| "paid"
	| "cancelled"
	| "all";

const TABS: ReadonlyArray<{ key: PayablesStatusFilter; label: string }> = [
	{ key: "outstanding", label: "Outstanding" },
	{ key: "open", label: "Open" },
	{ key: "partial", label: "Sebagian" },
	{ key: "paid", label: "Lunas" },
	{ key: "cancelled", label: "Cancelled" },
	{ key: "all", label: "Semua" },
];

export function PayablesStatusTabs({
	current,
	counts,
}: {
	current: PayablesStatusFilter;
	counts: Record<PayablesStatusFilter, number>;
}) {
	const params = useSearchParams();
	return (
		<div className="inline-flex h-9 items-center gap-0.5 rounded-full border border-border-subtle bg-card p-1 shadow-[var(--shadow-level-1)]">
			{TABS.map((t) => {
				const active = t.key === current;
				const next = new URLSearchParams(params.toString());
				if (t.key === "outstanding") next.delete("filter");
				else next.set("filter", t.key);
				const qs = next.toString();
				const href = `/finance/payables${qs ? `?${qs}` : ""}`;
				return (
					<Link
						key={t.key}
						href={href}
						aria-pressed={active}
						className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
							active
								? "bg-[#059669] text-white"
								: "text-muted-foreground hover:bg-secondary hover:text-foreground"
						}`}
					>
						{t.label}
						<span
							className={`tabular text-[10px] ${active ? "opacity-80" : "text-muted-foreground/70"}`}
						>
							{counts[t.key]}
						</span>
					</Link>
				);
			})}
		</div>
	);
}
