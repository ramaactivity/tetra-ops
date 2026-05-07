"use client";

import { Archive, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EVENT_STATUS_LABELS } from "@/lib/format";

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

export function OperationsFilterBar({
	defaultQ,
	defaultStatus,
	defaultMonth,
	defaultShowArchived = false,
	archivedCount = 0,
}: {
	defaultQ: string;
	defaultStatus: string;
	defaultMonth: string;
	defaultShowArchived?: boolean;
	archivedCount?: number;
}) {
	const router = useRouter();
	const [q, setQ] = useState(defaultQ);
	const hasFilters = Boolean(
		defaultQ || defaultStatus || defaultMonth || defaultShowArchived,
	);

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams();
		const merged: Record<string, string> = {
			q: defaultQ,
			status: defaultStatus,
			month: defaultMonth,
			show_archived: defaultShowArchived ? "1" : "",
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

	return (
		<div className="flex flex-wrap items-center gap-2">
			<form
				onSubmit={handleSubmit}
				className="relative min-w-[200px] flex-1 sm:max-w-xs"
			>
				<Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
				<input
					type="search"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Cari nama klien…"
					className="border-border bg-card focus-visible:ring-ring placeholder:text-muted-foreground/60 h-9 w-full rounded-md border pl-9 pr-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>
			</form>

			<select
				value={defaultStatus}
				onChange={(e) => router.push(buildHref({ status: e.target.value }))}
				className="border-border bg-card focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
			>
				<option value="">Semua status</option>
				{STATUS_FILTER_ORDER.map((s) => (
					<option key={s} value={s}>
						{EVENT_STATUS_LABELS[s] ?? s}
					</option>
				))}
			</select>

			<input
				type="month"
				value={defaultMonth}
				onChange={(e) => router.push(buildHref({ month: e.target.value }))}
				className="border-border bg-card focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
			/>

			<Link
				href={buildHref({ show_archived: defaultShowArchived ? "" : "1" })}
				className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
					defaultShowArchived
						? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
						: "border-border bg-card text-muted-foreground hover:text-foreground"
				}`}
				aria-pressed={defaultShowArchived}
			>
				<Archive className="h-3.5 w-3.5" />
				Show archived
				{archivedCount > 0 && (
					<span className="tabular text-xs opacity-70">({archivedCount})</span>
				)}
			</Link>

			{hasFilters && (
				<Link
					href="/operations"
					className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium"
				>
					<X className="h-3.5 w-3.5" />
					Clear
				</Link>
			)}
		</div>
	);
}
