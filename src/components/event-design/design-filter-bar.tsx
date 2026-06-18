"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilterBar } from "@/components/ui/filter-bar";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { MonthPicker } from "@/components/ui/month-picker";
import {
	DESIGN_STATUS_LABELS,
	DESIGN_STATUS_TONE,
	DESIGN_STATUS_VALUES,
	type DesignStatus,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <DesignFilterBar /> — one-row toolbar for Asset & Design, built on the shared
 * <FilterBar> shell so it matches the Operations (Event) page exactly: search on
 * its own row + a horizontal-scroll control row on mobile, inline on desktop.
 * The "Bulan ini / Semua bulan" shortcuts live INSIDE the month picker
 * (quickActions) — no separate toggle. Status filter = rounded-full pills.
 */
export function DesignFilterBar({
	defaultQ,
	month,
	showsAll,
	ds,
	scopedCount,
	statusCounts,
}: {
	defaultQ: string;
	/** "YYYY-MM" of the active month; ignored when showsAll. */
	month: string;
	showsAll: boolean;
	ds: DesignStatus | null;
	scopedCount: number;
	statusCounts: Record<DesignStatus, number>;
}) {
	const router = useRouter();
	const [q, setQ] = useState(defaultQ);

	const now = new Date();
	const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams();
		const merged: Record<string, string> = {
			q: defaultQ,
			month: showsAll ? "all" : month,
			ds: ds ?? "",
			...updates,
		};
		for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
		const qs = params.toString();
		return qs ? `/design?${qs}` : "/design";
	}

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		router.push(buildHref({ q }));
	}

	const hasFilters = Boolean(defaultQ || ds || showsAll);

	const chipClass = (active: boolean) =>
		cn(
			"inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
			active
				? "border-[#059669] bg-[#059669] text-white"
				: "border-border-default bg-card text-foreground/70 hover:bg-secondary hover:text-foreground",
		);

	return (
		<FilterBar
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
					value={showsAll ? "" : month}
					onValueChange={(value) => router.push(buildHref({ month: value }))}
					placeholder="Semua bulan"
					aria-label="Filter bulan"
					quickActions={[
						{
							label: "Bulan ini",
							onSelect: () => router.push(buildHref({ month: currentMonth })),
							active: !showsAll && month === currentMonth,
						},
						{
							label: "Semua bulan",
							onSelect: () => router.push(buildHref({ month: "all" })),
							active: showsAll,
						},
					]}
				/>
			</div>

			<Link
				href={buildHref({ ds: "" })}
				aria-current={!ds ? "true" : undefined}
				className={chipClass(!ds)}
			>
				Semua
				<span className="tabular text-[11px] opacity-70">{scopedCount}</span>
			</Link>
			{DESIGN_STATUS_VALUES.map((s) => {
				const active = ds === s;
				return (
					<Link
						key={s}
						href={buildHref({ ds: s })}
						aria-current={active ? "true" : undefined}
						className={chipClass(active)}
					>
						<span
							className={cn(
								"size-2 rounded-full",
								active ? "bg-white/90" : DESIGN_STATUS_TONE[s].dot,
							)}
							aria-hidden
						/>
						{DESIGN_STATUS_LABELS[s]}
						<span className="tabular text-[11px] opacity-70">
							{statusCounts[s]}
						</span>
					</Link>
				);
			})}

			{hasFilters && (
				<Link
					href="/design"
					className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
					Clear
				</Link>
			)}
		</FilterBar>
	);
}
