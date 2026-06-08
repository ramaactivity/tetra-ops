"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MonthPicker } from "@/components/ui/month-picker";
import { cn } from "@/lib/utils";

export function BillingFilterBar({
	defaultQ,
	defaultMonth,
	monthShowsAll = false,
}: {
	defaultQ: string;
	defaultMonth: string;
	/** When true, picker shows "Semua bulan" instead of a specific month
	 * (user has explicitly opted out of the current-month default). */
	monthShowsAll?: boolean;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [q, setQ] = useState(defaultQ);
	const hasFilters = Boolean(defaultQ || defaultMonth);

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams(searchParams.toString());
		for (const [k, v] of Object.entries(updates)) {
			if (v) params.set(k, v);
			else params.delete(k);
		}
		const qs = params.toString();
		return qs ? `/billing?${qs}` : "/billing";
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
				<Search
					className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<input
					type="search"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Cari nama klien…"
					className="h-9 w-full rounded-md border border-border-default bg-surface-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				/>
			</form>

			<div className="flex items-center gap-1.5">
				<div className="w-[180px]">
					<MonthPicker
						value={monthShowsAll ? "" : defaultMonth}
						onValueChange={(value) => router.push(buildHref({ month: value }))}
						placeholder="Semua bulan"
						aria-label="Filter bulan"
					/>
				</div>
				<Link
					href={buildHref({ month: monthShowsAll ? "" : "all" })}
					className={cn(
						"inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium transition-colors",
						monthShowsAll
							? "border-border-default bg-secondary text-foreground"
							: "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
					)}
					aria-pressed={monthShowsAll}
					title={
						monthShowsAll ? "Kembali ke bulan ini" : "Tampilkan semua bulan"
					}
				>
					{monthShowsAll ? "Bulan ini" : "Semua"}
				</Link>
			</div>

			{hasFilters && (
				<Link
					href="/billing"
					className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
					Clear
				</Link>
			)}
		</div>
	);
}
