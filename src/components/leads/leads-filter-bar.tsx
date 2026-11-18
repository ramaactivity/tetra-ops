"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FilterBar } from "@/components/ui/filter-bar";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { NativeSelect } from "@/components/ui/native-select";
import {
	PERIOD_OPTIONS,
	SEGMENT_OPTIONS,
	STAGE_OPTIONS,
	topicLabel,
} from "./leads-shared";

/**
 * <LeadsFilterBar /> — search + period + topic + segment + tahap (satu baris).
 * Export lives in the topbar action slot (see leads/page.tsx).
 * Built on the shared <FilterBar> shell; the status pills mirror the Asset &
 * Design page exactly (green = active, hairline = idle, colored dot + count).
 */

export function LeadsFilterBar({
	defaultQ,
	period,
	topic,
	segment,
	stage,
	topics,
	totalScoped,
	stageCounts,
}: {
	defaultQ: string;
	period: string;
	topic: string;
	segment: string;
	stage: string;
	/** Distinct topics present in the data, for the topic dropdown. */
	topics: string[];
	/** Kontak dalam filter aktif (minus tahap) — angka pil "Semua". */
	totalScoped: number;
	/** Jumlah kontak per tahap dalam filter aktif. */
	stageCounts: Record<string, number>;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [q, setQ] = useState(defaultQ);

	const hasFilters = Boolean(
		defaultQ || (period && period !== "all") || topic || segment || stage,
	);

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("page");
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

			{/* Tahap = dropdown (dulu 7 pil yang pecah jadi dua baris). */}
			<NativeSelect
				value={stage}
				onValueChange={(v) => router.push(buildHref({ stage: v }))}
				options={[
					{ value: "", label: `Semua tahap · ${totalScoped}` },
					...STAGE_OPTIONS.map((s) => ({
						value: s.value,
						label: `${s.label} · ${stageCounts[s.value] ?? 0}`,
					})),
				]}
				placeholder="Semua tahap"
				aria-label="Filter tahap"
				triggerClassName="rounded-full"
			/>

			{hasFilters && (
				<Link
					href={
						searchParams.get("view")
							? `/leads?view=${searchParams.get("view")}`
							: "/leads"
					}
					className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:ml-auto"
				>
					<X className="size-3.5" aria-hidden />
					Hapus filter
				</Link>
			)}
		</FilterBar>
	);
}
