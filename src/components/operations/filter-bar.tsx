"use client";

import { Archive, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MonthPicker } from "@/components/ui/month-picker";
import { NativeSelect } from "@/components/ui/native-select";
import { EVENT_STATUS_LABELS } from "@/lib/format";

/**
 * <OperationsFilterBar /> — search + status + month + crew filters.
 *
 * A4 refactor (sesi 5):
 * - Raw <select> × 2 → <NativeSelect> (status, crew)
 * - <input type="month"> → <MonthPicker> primitive
 * - Surface tokens, fluid type, transition tokens
 * - "Show archived" toggle keeps amber semantic tone for state clarity
 */

const STATUS_FILTER_ORDER: Array<keyof typeof EVENT_STATUS_LABELS | string> = [
	"draft",
	"confirmed",
	"design_brief",
	"design_approved",
	"upcoming",
	"in_progress",
	"awaiting_settlement",
	"completed",
	"cancelled",
	"archived",
];

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
	defaultShowArchived = false,
	archivedCount = 0,
	defaultCrew = "",
	crewOptions = [],
}: {
	defaultQ: string;
	defaultStatus: string;
	defaultMonth: string;
	defaultShowArchived?: boolean;
	archivedCount?: number;
	defaultCrew?: string;
	crewOptions?: CrewOption[];
}) {
	const router = useRouter();
	const [q, setQ] = useState(defaultQ);
	const hasFilters = Boolean(
		defaultQ ||
			defaultStatus ||
			defaultMonth ||
			defaultShowArchived ||
			defaultCrew,
	);

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams();
		const merged: Record<string, string> = {
			q: defaultQ,
			status: defaultStatus,
			month: defaultMonth,
			show_archived: defaultShowArchived ? "1" : "",
			crew: defaultCrew,
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
		<div className="flex flex-wrap items-center gap-2">
			<form
				onSubmit={handleSubmit}
				className="relative min-w-[200px] flex-1 sm:max-w-xs"
			>
				<Search
					className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<input
					type="search"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Cari nama klien…"
					className="h-9 w-full rounded-md border border-border-default bg-surface-2 pl-9 pr-3 text-fluid-body placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				/>
			</form>

			<NativeSelect
				value={defaultStatus}
				onValueChange={(value) => router.push(buildHref({ status: value }))}
				placeholder="Semua status"
				options={statusOptions}
				aria-label="Filter status"
			/>

			<div className="w-[180px]">
				<MonthPicker
					value={defaultMonth}
					onValueChange={(value) => router.push(buildHref({ month: value }))}
					placeholder="Semua bulan"
					aria-label="Filter bulan"
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
						triggerClassName="pl-7"
					/>
				</div>
			)}

			<Link
				href={buildHref({ show_archived: defaultShowArchived ? "" : "1" })}
				className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-fluid-caption font-medium transition-colors duration-fast ease-out-expo ${
					defaultShowArchived
						? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
						: "border-border-default bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
				}`}
				aria-pressed={defaultShowArchived}
			>
				<Archive className="size-3.5" aria-hidden />
				Show archived
				{archivedCount > 0 && (
					<span className="tabular opacity-70">({archivedCount})</span>
				)}
			</Link>

			{hasFilters && (
				<Link
					href="/operations"
					className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-fluid-caption font-medium text-muted-foreground hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
					Clear
				</Link>
			)}
		</div>
	);
}
