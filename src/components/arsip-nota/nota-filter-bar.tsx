"use client";

import { ArrowDownUp, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { FilterBar } from "@/components/ui/filter-bar";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { MonthPicker } from "@/components/ui/month-picker";
import type { NativeSelectOption } from "@/components/ui/native-select";
import { NativeSelect } from "@/components/ui/native-select";
import { DEFAULT_NOTA_SORT, NOTA_SORT_OPTIONS } from "@/lib/arsip-nota/types";

/**
 * Filter bar Arsip Nota — built on the shared <FilterBar> shell: search +
 * dropdown (sumber/kategori) + bulan + sort, dengan `rightSlot` (tab toggle)
 * menempel di kanan pada desktop. "Bulan ini / Semua bulan" hidup di dalam
 * dropdown kalender (quickActions). Mengubah URL searchParams; tab dipertahankan.
 */
export function NotaFilterBar({
	tab,
	basePath,
	defaultQ,
	defaultSelect,
	defaultMonth,
	monthShowsAll = false,
	monthActive = false,
	defaultSort,
	selectOptions,
	selectParamName,
	selectPlaceholder,
	searchPlaceholder,
	rightSlot,
}: {
	tab: string;
	basePath: string;
	defaultQ: string;
	defaultSelect: string;
	defaultMonth: string;
	/** True kalau user pilih "Semua bulan" (lihat lintas bulan). */
	monthShowsAll?: boolean;
	/** True kalau filter bulan beda dari default (bulan berjalan). */
	monthActive?: boolean;
	defaultSort: string;
	selectOptions: ReadonlyArray<NativeSelectOption>;
	selectParamName: "source" | "category";
	selectPlaceholder: string;
	searchPlaceholder: string;
	rightSlot?: ReactNode;
}) {
	const router = useRouter();
	const [q, setQ] = useState(defaultQ);
	const sortActive = defaultSort && defaultSort !== DEFAULT_NOTA_SORT;
	const hasFilters = Boolean(
		defaultQ || defaultSelect || monthActive || sortActive,
	);

	const now = new Date();
	const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

	function buildHref(updates: Record<string, string>) {
		const params = new URLSearchParams();
		const merged: Record<string, string> = {
			tab,
			q: defaultQ,
			[selectParamName]: defaultSelect,
			// Pertahankan mode "Semua bulan" saat filter lain berubah.
			month: monthShowsAll ? "all" : defaultMonth,
			sort: defaultSort === DEFAULT_NOTA_SORT ? "" : defaultSort,
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
		router.push(buildHref({ q, page: "" }));
	}

	return (
		<FilterBar
			search={
				<form onSubmit={handleSubmit}>
					<FilterSearchInput
						className="w-full"
						value={q}
						onValueChange={setQ}
						placeholder={searchPlaceholder}
					/>
				</form>
			}
		>
			<NativeSelect
				size="default"
				options={selectOptions}
				value={defaultSelect || selectOptions[0]?.value || ""}
				onValueChange={(v) =>
					router.push(
						buildHref({ [selectParamName]: v === "all" ? "" : v, page: "" }),
					)
				}
				placeholder={selectPlaceholder}
				aria-label={selectPlaceholder}
				triggerClassName="w-[160px]"
			/>

			<div className="w-[150px]">
				<MonthPicker
					value={monthShowsAll ? "" : defaultMonth}
					onValueChange={(v) => router.push(buildHref({ month: v, page: "" }))}
					placeholder="Semua bulan"
					className="h-8 text-[13px]"
					quickActions={[
						{
							label: "Bulan ini",
							onSelect: () =>
								router.push(buildHref({ month: currentMonth, page: "" })),
							active: !monthShowsAll && !monthActive,
						},
						{
							label: "Semua bulan",
							onSelect: () =>
								router.push(buildHref({ month: "all", page: "" })),
							active: monthShowsAll,
						},
					]}
				/>
			</div>

			<div className="relative">
				<ArrowDownUp
					className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<NativeSelect
					size="default"
					value={defaultSort || DEFAULT_NOTA_SORT}
					onValueChange={(v) => router.push(buildHref({ sort: v, page: "" }))}
					options={NOTA_SORT_OPTIONS.map((o) => ({ ...o }))}
					aria-label="Urutkan nota"
					triggerClassName="w-[170px] pl-7"
				/>
			</div>

			{hasFilters ? (
				<Link
					href={buildHref({
						q: "",
						[selectParamName]: "",
						month: "",
						sort: "",
						page: "",
					})}
					className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
					Reset
				</Link>
			) : null}

			{rightSlot ? <div className="sm:ml-auto">{rightSlot}</div> : null}
		</FilterBar>
	);
}
