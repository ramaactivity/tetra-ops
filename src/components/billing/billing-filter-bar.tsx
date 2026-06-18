"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FilterBar } from "@/components/ui/filter-bar";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { MonthPicker } from "@/components/ui/month-picker";
import { cn } from "@/lib/utils";

/**
 * <BillingFilterBar /> — built on the shared <FilterBar> shell. Search + month
 * picker + clear, with payment-status chips pushed to the right on desktop. The
 * "Bulan ini / Semua bulan" shortcuts live inside the MonthPicker dropdown.
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
	const hasFilters = Boolean(defaultQ || monthShowsAll || currentTab !== "all");

	const now = new Date();
	const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

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
		<FilterBar
			searchClassName="sm:w-[240px]"
			search={
				<form onSubmit={handleSubmit}>
					<FilterSearchInput
						className="w-full"
						value={q}
						onValueChange={setQ}
						placeholder="Cari nama klien…"
					/>
				</form>
			}
		>
			<div className="w-[150px]">
				<MonthPicker
					value={monthShowsAll ? "" : defaultMonth}
					onValueChange={(value) => router.push(buildHref({ month: value }))}
					placeholder="Semua bulan"
					aria-label="Filter bulan"
					quickActions={[
						{
							label: "Bulan ini",
							onSelect: () => router.push(buildHref({ month: currentMonth })),
							active: !monthShowsAll && defaultMonth === currentMonth,
						},
						{
							label: "Semua bulan",
							onSelect: () => router.push(buildHref({ month: "all" })),
							active: monthShowsAll,
						},
					]}
				/>
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

			{/* Payment-status chips — right-aligned on desktop */}
			<div className="flex items-center gap-1.5 sm:ml-auto">
				{TABS.map((tab) => {
					const active = currentTab === tab.value;
					const count = tabCounts[tab.value] ?? 0;
					return (
						<Link
							key={tab.value}
							href={tabHref(tab.value)}
							aria-pressed={active}
							className={cn(
								"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
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
		</FilterBar>
	);
}
