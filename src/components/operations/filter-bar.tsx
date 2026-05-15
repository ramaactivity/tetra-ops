"use client";

import { Archive, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MonthPicker } from "@/components/ui/month-picker";
import { NativeSelect } from "@/components/ui/native-select";
import { EVENT_STATUS_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <OperationsFilterBar /> — Vercel filter chrome.
 *
 * All controls share the same 32px height + 6px radius + white card surface
 * with hairline border. Search input + selects + month picker + archived
 * toggle line up on one row with body-sm typography. The "Show archived"
 * toggle uses subtle inset fill when active (no loud color).
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

const CONTROL_BASE =
	"inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-card px-3 text-[13px] font-medium leading-none text-foreground transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none";

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
				className="relative min-w-[200px] flex-1 sm:max-w-[280px]"
			>
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

			<NativeSelect
				value={defaultStatus}
				onValueChange={(value) => router.push(buildHref({ status: value }))}
				placeholder="Semua status"
				options={statusOptions}
				aria-label="Filter status"
			/>

			<div className="w-[160px]">
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
				className={cn(
					CONTROL_BASE,
					defaultShowArchived
						? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
						: "text-muted-foreground hover:text-foreground",
				)}
				aria-pressed={defaultShowArchived}
			>
				<Archive className="size-3.5" aria-hidden />
				<span>Show archived</span>
				{archivedCount > 0 && (
					<span className="tabular text-[12px] opacity-60">
						({archivedCount})
					</span>
				)}
			</Link>

			{hasFilters && (
				<Link
					href="/operations"
					className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
					Clear
				</Link>
			)}
		</div>
	);
}
