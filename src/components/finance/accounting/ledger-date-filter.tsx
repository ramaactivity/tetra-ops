"use client";

import { Calendar } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function LedgerDateFilter({
	defaultFrom,
	defaultTo,
}: {
	defaultFrom?: string;
	defaultTo?: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	function update(field: "from" | "to", value: string) {
		const next = new URLSearchParams(params.toString());
		if (value) next.set(field, value);
		else next.delete(field);
		const qs = next.toString();
		router.push(`${pathname}${qs ? `?${qs}` : ""}`);
	}

	function clear() {
		router.push(pathname);
	}

	const hasFilter = !!(defaultFrom || defaultTo);

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-card p-2 text-fluid-caption">
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
