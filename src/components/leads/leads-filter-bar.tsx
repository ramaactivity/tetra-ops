"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FilterBar } from "@/components/ui/filter-bar";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
	PERIOD_OPTIONS,
	SEGMENT_OPTIONS,
	STATUS_DOT,
	STATUS_OPTIONS,
	topicLabel,
} from "./leads-shared";

/**
 * <LeadsFilterBar /> — search + period + topic + segment + status pills.
 * Export lives in the topbar action slot (see leads/page.tsx).
 * Built on the shared <FilterBar> shell; the status pills mirror the Asset &
 * Design page exactly (green = active, hairline = idle, colored dot + count).
 */

export function LeadsFilterBar({
	defaultQ,
	period,
	topic,
	segment,
	status,
	topics,
	totalScoped,
	statusCounts,
}: {
	defaultQ: string;
	period: string;
	topic: string;
	segment: string;
	status: string;
	/** Distinct topics present in the data, for the topic dropdown. */
	topics: string[];
	/** Lead count in the current period+topic scope (drives the "Semua" pill). */
	totalScoped: number;
	/** Per-status counts in the current period+topic scope. */
	statusCounts: Record<string, number>;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [q, setQ] = useState(defaultQ);

	const hasFilters = Boolean(
		defaultQ || (period && period !== "all") || topic || segment || status,
	);

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams(searchParams.toString());
		for (const [k, v] of Object.entries(updates)) {
			if (v) params.set(k, v);
			else params.delete(k);
		}
		const qs = params.toString();
		return qs ? `/leads?${qs}` : "/leads";
	}

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		router.push(buildHref({ q }));
	}

	const topicOptions = [
		{ value: "", label: "Semua topik" },
		...topics.map((t) => ({ value: t, label: topicLabel(t) })),
	];

	const segmentOptions = [
		{ value: "", label: "Semua segmen" },
		...SEGMENT_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
	];

	// Status pill chrome — identical spec to DesignFilterBar so the two pages
	// read as one system: 32px tall, rounded-full, green when active.
	const chipClass = (active: boolean) =>
		cn(
			"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
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
						placeholder="Cari nomor, nama, pesan…"
					/>
				</form>
			}
		>
			<NativeSelect
				value={period || "all"}
				onValueChange={(v) => router.push(buildHref({ period: v }))}
				options={PERIOD_OPTIONS.map((o) => ({
					value: o.value,
					label: o.label,
				}))}
				aria-label="Filter periode"
				triggerClassName="rounded-full"
			/>

			<NativeSelect
				value={topic}
				onValueChange={(v) => router.push(buildHref({ topic: v }))}
				options={topicOptions}
				placeholder="Semua topik"
				aria-label="Filter topik"
				triggerClassName="rounded-full"
			/>

			<NativeSelect
				value={segment}
				onValueChange={(v) => router.push(buildHref({ segment: v }))}
				options={segmentOptions}
				placeholder="Semua segmen"
				aria-label="Filter segmen"
				triggerClassName="rounded-full"
			/>

			{/* Status pills — flow inline (no wrapper) so the whole toolbar packs
			    onto one row like every other list page. */}
			<Link
				href={buildHref({ status: "" })}
				aria-current={!status ? "true" : undefined}
				className={chipClass(!status)}
			>
				Semua
				<span className="tabular text-[11px] opacity-70">{totalScoped}</span>
			</Link>
			{STATUS_OPTIONS.map((s) => {
				const active = status === s.value;
				return (
					<Link
						key={s.value}
						href={buildHref({ status: s.value })}
						aria-current={active ? "true" : undefined}
						className={chipClass(active)}
					>
						<span
							className={cn(
								"size-2 rounded-full",
								active ? "bg-white/90" : STATUS_DOT[s.value],
							)}
							aria-hidden
						/>
						{s.label}
						<span className="tabular text-[11px] opacity-70">
							{statusCounts[s.value] ?? 0}
						</span>
					</Link>
				);
			})}

			{hasFilters && (
				<Link
					href="/leads"
					className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:ml-auto"
				>
					<X className="size-3.5" aria-hidden />
					Clear
				</Link>
			)}
		</FilterBar>
	);
}
