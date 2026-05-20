import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * <KpiRow /> — 4-col equal-width KPI tile row.
 *
 * Mobile (<sm): single column.
 * Tablet (≥sm): 2 columns.
 * Desktop (≥lg): 4 columns.
 *
 * Compose with <KpiCard> children. Uses <dl> semantics — KpiCard
 * already emits <dt>/<dd>, so the dl wrapper is the natural parent.
 *
 * Pattern source: /operations list page (the reference layout).
 */

interface KpiRowProps {
	children: ReactNode;
	className?: string;
}

export function KpiRow({ children, className }: KpiRowProps) {
	return (
		<dl
			className={cn(
				"grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
				className,
			)}
			data-slot="kpi-row"
		>
			{children}
		</dl>
	);
}
