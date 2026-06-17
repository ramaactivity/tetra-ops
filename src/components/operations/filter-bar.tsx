"use client";

import { ArrowDownUp, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { MonthPicker } from "@/components/ui/month-picker";
import { NativeSelect } from "@/components/ui/native-select";
import { EVENT_STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <OperationsFilterBar /> — Vercel filter chrome.
 *
 * All controls share the same 32px height + 6px radius + white card surface
 * with hairline border. Search input + selects + month picker + crew filter
 * line up on one row with body-sm typography. Archived/legacy events are
 * always listed, so there is no archived toggle.
 */

const STATUS_FILTER_ORDER: Array<keyof typeof EVENT_STATUS_LABELS | string> = [
	"upcoming",
	"in_progress",
	"awaiting_settlement",
	"completed",
	"cancelled",
];

const SORT_OPTIONS = [
	{ value: "date_asc", label: "Tanggal · terdekat" },
	{ value: "date_desc", label: "Tanggal · terjauh" },
	{ value: "name_asc", label: "Nama klien · A–Z" },
	{ value: "name_desc", label: "Nama klien · Z–A" },
] as const;

const DEFAULT_SORT = "date_asc";

export type CrewOption = {
	id: string;
	full_name: string;
	nickname: string | null;
	tier: "senior" | "junior" | null;
};

export function OperationsFilterBar({
	defaultQ,
	defaultStatus,
	defaultMonth,
	monthShowsAll = false,
	defaultCrew = "",
	crewOptions = [],
	defaultSort = DEFAULT_SORT,
}: {
	defaultQ: string;
	defaultStatus: string;
	defaultMonth: string;
	/** When true, picker shows "Semua bulan" instead of a specific month
	 * (user has explicitly opted out of the current-month default). */
	monthShowsAll?: boolean;
	defaultCrew?: string;
	crewOptions?: CrewOption[];
	defaultSort?: string;
}) {
	const router = useRouter();
	const [q, setQ] = useState(defaultQ);
	const hasFilters = Boolean(
		defaultQ || defaultStatus || defaultMonth || defaultCrew,
	);

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams();
		const merged: Record<string, string> = {
			q: defaultQ,
			status: defaultStatus,
			month: defaultMonth,
			crew: defaultCrew,
			sort: defaultSort === DEFAULT_SORT ? "" : defaultSort,
			...updates,
		};
		for (const [k, v] of Object.entries(merged)) {
			if (v) params.set(k, v);
		}
		const qs = params.toString();
		return qs ? `/operations?${qs}` : "/operations";
	}

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		router.push(buildHref({ q }));
	}

	const statusOptions = [
		{ value: "", label: "Semua status" },
		...STATUS_FILTER_ORDER.map((s) => ({
			value: String(s),
			label: EVENT_STATUS_LABELS[s] ?? String(s),
		})),
	];

	const crewSelectOptions = [
		{ value: "", label: "Semua crew" },
		...crewOptions.map((c) => ({
			value: c.id,
			label: `${c.nickname ?? c.full_name}${c.tier ? ` · ${c.tier}` : ""}`,
		})),
	];

	return (
		<div className="space-y-2">
			{/* Search — full width on its own row (mobile) */}
			<form onSubmit={handleSubmit} className="sm:hidden">
				<FilterSearchInput
					className="w-full"
					value={q}
					onValueChange={setQ}
					placeholder="Cari nama klien…"
				/>
			</form>

			{/* Filters — one tidy horizontal-scroll row on mobile, wrapping on desktop */}
			<div className="hide-scrollbar flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
				<form
					onSubmit={handleSubmit}
					className="hidden sm:block sm:min-w-[200px] sm:max-w-[280px] sm:flex-1"
				>
					<FilterSearchInput
						className="w-full"
						value={q}
						onValueChange={setQ}
						placeholder="Cari nama klien…"
					/>
				</form>

				<div className="shrink-0">
					<NativeSelect
						value={defaultStatus}
						onValueChange={(value) => router.push(buildHref({ status: value }))}
						placeholder="Semua status"
						options={statusOptions}
						aria-label="Filter status"
					/>
				</div>

				<div className="flex shrink-0 items-center gap-1">
					<div className="w-[150px]">
						<MonthPicker
							value={monthShowsAll ? "" : defaultMonth}
							onValueChange={(value) =>
								router.push(buildHref({ month: value }))
							}
							placeholder="Semua bulan"
							aria-label="Filter bulan"
						/>
					</div>
					<Link
						href={buildHref({ month: monthShowsAll ? "" : "all" })}
						className={cn(
							"inline-flex h-8 shrink-0 items-center rounded-md px-2 text-[12px] font-medium transition-colors",
							monthShowsAll
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:bg-secondary hover:text-foreground",
						)}
						aria-pressed={monthShowsAll}
						title={
							monthShowsAll ? "Kembali ke bulan ini" : "Tampilkan semua bulan"
						}
					>
						{monthShowsAll ? "Bulan ini" : "Semua"}
					</Link>
				</div>

				{crewOptions.length > 0 && (
					<div className="relative shrink-0">
						<Users
							className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
							aria-hidden
						/>
						<NativeSelect
							value={defaultCrew}
							onValueChange={(value) => router.push(buildHref({ crew: value }))}
							placeholder="Semua crew"
							options={crewSelectOptions}
							aria-label="Filter crew"
							triggerClassName="pl-7"
						/>
					</div>
				)}

				<div className="relative shrink-0">
					<ArrowDownUp
						className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
						aria-hidden
					/>
					<NativeSelect
						value={defaultSort}
						onValueChange={(value) => router.push(buildHref({ sort: value }))}
						options={SORT_OPTIONS.map((o) => ({ ...o }))}
						aria-label="Urutkan event"
						triggerClassName="pl-7"
					/>
				</div>

				{hasFilters && (
					<Link
						href="/operations"
						className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						<X className="size-3.5" aria-hidden />
						Clear
					</Link>
				)}
			</div>
		</div>
	);
}
