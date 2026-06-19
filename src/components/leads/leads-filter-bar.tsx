"use client";

import { Download, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FilterBar } from "@/components/ui/filter-bar";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { PERIOD_OPTIONS, STATUS_OPTIONS, topicLabel } from "./leads-shared";

/**
 * <LeadsFilterBar /> — search + period + topic + status chips + export.
 * Built on the shared <FilterBar> shell (mirrors BillingFilterBar).
 */

export function LeadsFilterBar({
	defaultQ,
	period,
	topic,
	status,
	topics,
}: {
	defaultQ: string;
	period: string;
	topic: string;
	status: string;
	/** Distinct topics present in the data, for the topic dropdown. */
	topics: string[];
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [q, setQ] = useState(defaultQ);

	const hasFilters = Boolean(
		defaultQ || (period && period !== "all") || topic || status,
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

	const exportHref = `/api/leads/export?${searchParams.toString()}`;

	return (
		<FilterBar
			searchClassName="sm:w-[220px]"
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

			{hasFilters && (
				<Link
					href="/leads"
					className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
					Clear
				</Link>
			)}

			{/* Status chips + export — right-aligned on desktop */}
			<div className="flex items-center gap-1.5 sm:ml-auto">
				{[{ value: "", label: "Semua" }, ...STATUS_OPTIONS].map((s) => {
					const active = (status || "") === s.value;
					return (
						<Link
							key={s.value || "all"}
							href={buildHref({ status: s.value })}
							aria-pressed={active}
							className={cn(
								"inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-colors",
								active
									? "border-foreground/15 bg-foreground/[0.06] text-foreground"
									: "border-border-default text-muted-foreground hover:text-foreground",
							)}
						>
							{s.label}
						</Link>
					);
				})}

				<a
					href={exportHref}
					className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border-default px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<Download className="size-3.5" aria-hidden />
					Export
				</a>
			</div>
		</FilterBar>
	);
}
