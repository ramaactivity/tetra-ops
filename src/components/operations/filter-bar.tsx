"use client";

import { ArrowDownUp, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilterBar } from "@/components/ui/filter-bar";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { MonthPicker } from "@/components/ui/month-picker";
import { NativeSelect } from "@/components/ui/native-select";
import { EVENT_STATUS_LABELS } from "@/lib/format";

/**
 * <OperationsFilterBar /> — built on the shared <FilterBar> shell so it matches
 * every other filter bar in the app: search on its own full-width row + a tidy
 * horizontal-scroll control row on mobile, inline wrapping row on desktop.
 *
 * The month "Bulan ini / Semua bulan" shortcuts live INSIDE the MonthPicker
 * dropdown (quickActions) on both mobile and desktop — no separate toggle chrome.
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
		defaultQ || defaultStatus || monthShowsAll || defaultCrew,
	);

	const now = new Date();
	const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams();
		const merged: Record<string, string> = {
			q: defaultQ,
			status: defaultStatus,
			month: monthShowsAll ? "all" : defaultMonth,
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
			<NativeSelect
				value={defaultStatus}
				onValueChange={(value) => router.push(buildHref({ status: value }))}
				placeholder="Semua status"
				options={statusOptions}
				aria-label="Filter status"
				triggerClassName="rounded-full"
			/>

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

			{crewOptions.length > 0 && (
				<div className="relative">
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
						triggerClassName="pl-7 rounded-full"
					/>
				</div>
			)}

			<div className="relative">
				<ArrowDownUp
					className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<NativeSelect
					value={defaultSort}
					onValueChange={(value) => router.push(buildHref({ sort: value }))}
					options={SORT_OPTIONS.map((o) => ({ ...o }))}
					aria-label="Urutkan event"
					triggerClassName="pl-7 rounded-full"
				/>
			</div>

			{hasFilters && (
				<Link
					href="/operations"
					className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
					Clear
				</Link>
			)}
		</FilterBar>
	);
}
