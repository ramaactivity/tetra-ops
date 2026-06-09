"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MonthPicker } from "@/components/ui/month-picker";
import { cn } from "@/lib/utils";

/**
 * <BillingFilterBar /> — single unified filter row, consistent with the
 * Asset & Design page: search + month picker on the left, payment-status
 * chips pushed to the right (sm:ml-auto). Each chip carries a tone dot + count.
 */

type TabMeta = {
	value: string;
	label: string;
	dot?: string;
	/** Active (selected) chip style. */
	badge: string;
};

const TABS: TabMeta[] = [
	{
		value: "all",
		label: "Semua",
		badge: "border-foreground/15 bg-foreground/[0.06] text-foreground",
	},
	{
		value: "unpaid",
		label: "Unpaid",
		dot: "bg-muted-foreground/60",
		badge: "border-foreground/15 bg-foreground/[0.06] text-foreground",
	},
	{
		value: "dp_partial",
		label: "DP / Partial",
		dot: "bg-amber-500",
		badge:
			"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
	},
	{
		value: "paid",
		label: "Lunas",
		dot: "bg-emerald-500",
		badge:
			"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	},
	{
		value: "overdue",
		label: "Overdue",
		dot: "bg-rose-500",
		badge: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
	},
];

export function BillingFilterBar({
	defaultQ,
	defaultMonth,
	monthShowsAll = false,
	currentTab = "all",
	tabCounts = {},
}: {
	defaultQ: string;
	defaultMonth: string;
	/** When true, picker shows "Semua bulan" instead of a specific month
	 * (user has explicitly opted out of the current-month default). */
	monthShowsAll?: boolean;
	currentTab?: string;
	tabCounts?: Record<string, number>;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [q, setQ] = useState(defaultQ);
	const hasFilters = Boolean(defaultQ || defaultMonth || currentTab !== "all");

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams(searchParams.toString());
		for (const [k, v] of Object.entries(updates)) {
			if (v) params.set(k, v);
			else params.delete(k);
		}
		const qs = params.toString();
		return qs ? `/billing?${qs}` : "/billing";
	}

	function tabHref(tab: string) {
		return buildHref({ tab: tab === "all" ? "" : tab });
	}

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		router.push(buildHref({ q }));
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<form onSubmit={handleSubmit} className="relative w-full sm:w-[240px]">
				<Search
					className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<input
					type="search"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Cari nama klien…"
					className="h-8 w-full rounded-md border border-border-default bg-card pl-8 pr-3 text-[13px] leading-none text-foreground placeholder:text-muted-foreground/70 transition-colors hover:bg-secondary/40 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
				/>
			</form>

			<div className="flex items-center gap-1">
				<div className="w-[160px]">
					<MonthPicker
						value={monthShowsAll ? "" : defaultMonth}
						onValueChange={(value) => router.push(buildHref({ month: value }))}
						placeholder="Semua bulan"
						aria-label="Filter bulan"
					/>
				</div>
				<Link
					href={buildHref({ month: monthShowsAll ? "" : "all" })}
					className={cn(
						"inline-flex h-8 items-center rounded-md px-2 text-[12px] font-medium transition-colors",
						monthShowsAll
							? "bg-secondary text-foreground"
							: "text-muted-foreground hover:bg-secondary hover:text-foreground",
					)}
					aria-pressed={monthShowsAll}
					title={monthShowsAll ? "Kembali ke bulan ini" : "Tampilkan semua bulan"}
				>
					{monthShowsAll ? "Bulan ini" : "Semua"}
				</Link>
			</div>

			{hasFilters && (
				<Link
					href="/billing"
					className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
					Clear
				</Link>
			)}

			{/* Payment-status chips — right-aligned, mirrors Asset & Design */}
			<div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
				{TABS.map((tab) => {
					const active = currentTab === tab.value;
					const count = tabCounts[tab.value] ?? 0;
					return (
						<Link
							key={tab.value}
							href={tabHref(tab.value)}
							aria-pressed={active}
							className={cn(
								"inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-medium transition-colors",
								active
									? tab.badge
									: "border-border-default text-muted-foreground hover:text-foreground",
							)}
						>
							{tab.dot && (
								<span
									className={cn("size-1.5 rounded-full", tab.dot)}
									aria-hidden
								/>
							)}
							{tab.label}
							<span className="tabular opacity-60">{count}</span>
						</Link>
					);
				})}
			</div>
		</div>
	);
}
