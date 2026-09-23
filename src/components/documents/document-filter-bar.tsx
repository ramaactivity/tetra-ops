"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilterBar } from "@/components/ui/filter-bar";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { MonthPicker } from "@/components/ui/month-picker";
import { NativeSelect } from "@/components/ui/native-select";
import { DOC_STATUS_LABEL, DOC_STATUSES } from "@/lib/documents/types";

const BASE = "/finance/dokumen";

export function DocumentFilterBar({
	type,
	q,
	status,
	month,
	monthShowsAll,
}: {
	type: string;
	q: string;
	status: string;
	month: string;
	monthShowsAll: boolean;
}) {
	const router = useRouter();
	const [search, setSearch] = useState(q);
	const now = new Date();
	const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	const hasFilters = Boolean(
		q || status || monthShowsAll || (month && month !== currentMonth),
	);

	function href(updates: Record<string, string>) {
		const p = new URLSearchParams();
		const merged: Record<string, string> = {
			type,
			q,
			status,
			month: monthShowsAll ? "all" : month,
			...updates,
		};
		for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
		const qs = p.toString();
		return qs ? `${BASE}?${qs}` : BASE;
	}

	return (
		<FilterBar
			search={
				<form
					onSubmit={(e) => {
						e.preventDefault();
						router.push(href({ q: search }));
					}}
				>
					<FilterSearchInput
						className="w-full"
						value={search}
						onValueChange={setSearch}
						placeholder="Cari nomor / klien…"
					/>
				</form>
			}
		>
			<NativeSelect
				size="sm"
				options={DOC_STATUSES.map((s) => ({
					value: s,
					label: DOC_STATUS_LABEL[s],
				}))}
				value={status}
				onValueChange={(v) => router.push(href({ status: v }))}
				placeholder="Semua status"
				aria-label="Status"
			/>
			<div className="w-[150px]">
				<MonthPicker
					value={monthShowsAll ? "" : month}
					onValueChange={(v) => router.push(href({ month: v }))}
					placeholder="Semua bulan"
					className="h-8 text-[13px]"
					quickActions={[
						{
							label: "Bulan ini",
							onSelect: () => router.push(href({ month: currentMonth })),
							active: !monthShowsAll && month === currentMonth,
						},
						{
							label: "Semua bulan",
							onSelect: () => router.push(href({ month: "all" })),
							active: monthShowsAll,
						},
					]}
					aria-label="Bulan"
				/>
			</div>
			{hasFilters ? (
				<Link
					href={href({ q: "", status: "", month: "" })}
					className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] text-muted-foreground hover:bg-secondary hover:text-foreground"
				>
					<X className="size-3.5" /> Reset
				</Link>
			) : null}
		</FilterBar>
	);
}
