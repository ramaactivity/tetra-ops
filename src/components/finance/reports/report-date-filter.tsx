"use client";

import { Calendar } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function ReportDateFilter({
	mode,
	defaultFrom,
	defaultTo,
	defaultAsOf,
}: {
	mode: "range" | "as-of";
	defaultFrom?: string;
	defaultTo?: string;
	defaultAsOf?: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	function update(field: string, value: string) {
		const next = new URLSearchParams(params.toString());
		if (value) next.set(field, value);
		else next.delete(field);
		const qs = next.toString();
		router.push(`${pathname}${qs ? `?${qs}` : ""}`);
	}

	function clear() {
		const next = new URLSearchParams(params.toString());
		next.delete("from");
		next.delete("to");
		next.delete("asOf");
		const qs = next.toString();
		router.push(`${pathname}${qs ? `?${qs}` : ""}`);
	}

	const hasFilter =
		mode === "as-of"
			? !!defaultAsOf
			: !!(defaultFrom || defaultTo);

	function setPreset(preset: "month" | "ytd" | "all") {
		const next = new URLSearchParams(params.toString());
		const now = new Date();
		if (preset === "month") {
			const from = new Date(now.getFullYear(), now.getMonth(), 1)
				.toISOString()
				.slice(0, 10);
			const to = now.toISOString().slice(0, 10);
			next.set("from", from);
			next.set("to", to);
		} else if (preset === "ytd") {
			const from = new Date(now.getFullYear(), 0, 1)
				.toISOString()
				.slice(0, 10);
			const to = now.toISOString().slice(0, 10);
			next.set("from", from);
			next.set("to", to);
		} else {
			next.delete("from");
			next.delete("to");
		}
		const qs = next.toString();
		router.push(`${pathname}${qs ? `?${qs}` : ""}`);
	}

	if (mode === "as-of") {
		return (
			<div className="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-surface-2 p-2 text-fluid-caption">
				<Calendar className="size-3.5 text-muted-foreground" />
				<span className="text-muted-foreground">Per tanggal:</span>
				<input
					type="date"
					defaultValue={defaultAsOf ?? ""}
					onChange={(e) => update("asOf", e.target.value)}
					className="h-8 rounded-md border border-border-default bg-surface-1 px-2 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
				/>
				<span className="text-[11px] text-muted-foreground">
					Saldo akumulatif sampai tanggal ini
				</span>
				{hasFilter && (
					<button
						type="button"
						onClick={clear}
						className="press-down ml-auto inline-flex h-8 items-center rounded-md border border-border-default bg-surface-1 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
					>
						Reset
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-surface-2 p-2 text-fluid-caption">
			<Calendar className="size-3.5 text-muted-foreground" />
			<span className="text-muted-foreground">Periode:</span>
			<input
				type="date"
				defaultValue={defaultFrom ?? ""}
				onChange={(e) => update("from", e.target.value)}
				className="h-8 rounded-md border border-border-default bg-surface-1 px-2 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
			/>
			<span className="text-muted-foreground">→</span>
			<input
				type="date"
				defaultValue={defaultTo ?? ""}
				onChange={(e) => update("to", e.target.value)}
				className="h-8 rounded-md border border-border-default bg-surface-1 px-2 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
			/>
			<div className="ml-2 flex items-center gap-1">
				<button
					type="button"
					onClick={() => setPreset("month")}
					className="press-down inline-flex h-8 items-center rounded-md border border-border-default bg-surface-1 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
				>
					Bulan ini
				</button>
				<button
					type="button"
					onClick={() => setPreset("ytd")}
					className="press-down inline-flex h-8 items-center rounded-md border border-border-default bg-surface-1 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
				>
					YTD
				</button>
				<button
					type="button"
					onClick={() => setPreset("all")}
					className="press-down inline-flex h-8 items-center rounded-md border border-border-default bg-surface-1 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
				>
					Semua
				</button>
			</div>
			{hasFilter && (
				<button
					type="button"
					onClick={clear}
					className="press-down inline-flex h-8 items-center rounded-md border border-border-default bg-surface-1 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
				>
					Reset
				</button>
			)}
		</div>
	);
}
