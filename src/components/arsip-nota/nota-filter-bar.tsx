"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MonthPicker } from "@/components/ui/month-picker";
import type { NativeSelectOption } from "@/components/ui/native-select";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * Filter bar Arsip Nota — search + dropdown (sumber/kategori) + bulan.
 * Mengubah URL searchParams (server-rendered). Tab dipertahankan.
 */
export function NotaFilterBar({
	tab,
	basePath,
	defaultQ,
	defaultSelect,
	defaultMonth,
	selectOptions,
	selectParamName,
	selectPlaceholder,
	searchPlaceholder,
}: {
	tab: string;
	basePath: string;
	defaultQ: string;
	defaultSelect: string;
	defaultMonth: string;
	selectOptions: ReadonlyArray<NativeSelectOption>;
	selectParamName: "source" | "category";
	selectPlaceholder: string;
	searchPlaceholder: string;
}) {
	const router = useRouter();
	const [q, setQ] = useState(defaultQ);
	const hasFilters = Boolean(defaultQ || defaultSelect || defaultMonth);

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams();
		const merged: Record<string, string> = {
			tab,
			q: defaultQ,
			[selectParamName]: defaultSelect,
			month: defaultMonth,
			...updates,
		};
		for (const [k, v] of Object.entries(merged)) {
			if (v) params.set(k, v);
		}
		const qs = params.toString();
		return qs ? `${basePath}?${qs}` : basePath;
	}

	function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		// reset page when searching
		router.push(buildHref({ q, page: "" }));
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<form
				onSubmit={handleSubmit}
				className="relative min-w-[200px] flex-1 sm:max-w-[300px]"
			>
				<Search
					className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<input
					type="search"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder={searchPlaceholder}
					className="h-8 w-full rounded-md border border-border-default bg-card pl-8 pr-3 text-sm shadow-[var(--shadow-level-1)] outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30"
				/>
			</form>

			<NativeSelect
				size="sm"
				options={selectOptions}
				value={defaultSelect || selectOptions[0]?.value || ""}
				onValueChange={(v) =>
					router.push(
						buildHref({ [selectParamName]: v === "all" ? "" : v, page: "" }),
					)
				}
				placeholder={selectPlaceholder}
				aria-label={selectPlaceholder}
			/>

			<MonthPicker
				value={defaultMonth}
				onValueChange={(v) => router.push(buildHref({ month: v, page: "" }))}
			/>

			{hasFilters ? (
				<Link
					href={buildHref({
						q: "",
						[selectParamName]: "",
						month: "",
						page: "",
					})}
					className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-secondary"
				>
					<X className="size-3.5" aria-hidden />
					Reset
				</Link>
			) : null}
		</div>
	);
}
