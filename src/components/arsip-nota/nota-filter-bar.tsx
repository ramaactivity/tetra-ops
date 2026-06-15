"use client";

import { ArrowDownUp, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { MonthPicker } from "@/components/ui/month-picker";
import type { NativeSelectOption } from "@/components/ui/native-select";
import { NativeSelect } from "@/components/ui/native-select";
import { DEFAULT_NOTA_SORT, NOTA_SORT_OPTIONS } from "@/lib/arsip-nota/types";
import { cn } from "@/lib/utils";

/**
 * Filter bar Arsip Nota — search + dropdown (sumber/kategori) + bulan, dengan
 * tinggi kontrol seragam (h-8). `rightSlot` (tab toggle) menempel di kanan.
 * Mengubah URL searchParams (server-rendered). Tab dipertahankan.
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
		<div className="flex flex-wrap items-center gap-2">
			<form
				onSubmit={handleSubmit}
				className="relative min-w-[200px] flex-1 sm:max-w-[280px]"
			>
				<Search
					className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<input
					type="search"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder={searchPlaceholder}
					className="h-8 w-full rounded-md border border-border-default bg-card pr-3 pl-8 text-[13px] shadow-[var(--shadow-level-1)] outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30"
				/>
			</form>

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

			<div className="flex items-center gap-1">
				<div className="w-[150px]">
					<MonthPicker
						value={monthShowsAll ? "" : defaultMonth}
						onValueChange={(v) =>
							router.push(buildHref({ month: v, page: "" }))
						}
						placeholder="Semua bulan"
						className="h-8 text-[13px]"
					/>
				</div>
				<Link
					href={buildHref({ month: monthShowsAll ? "" : "all", page: "" })}
					className={cn(
						"inline-flex h-8 items-center rounded-md px-2 text-[12px] font-medium transition-colors",
						monthShowsAll
							? "bg-secondary text-foreground"
							: "text-muted-foreground hover:bg-secondary hover:text-foreground",
					)}
					aria-pressed={monthShowsAll}
					title={
						monthShowsAll ? "Kembali ke bulan ini" : "Tampilkan semua bulan"
					}
				>
					{monthShowsAll ? "Bulan ini" : "Semua"}
				</Link>
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

			{rightSlot ? <div className="ml-auto">{rightSlot}</div> : null}
		</div>
	);
}
