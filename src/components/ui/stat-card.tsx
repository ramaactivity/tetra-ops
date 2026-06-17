import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <StatCard /> — UpGradely KPI tile (sibling of KpiCard).
 * Normal-case medium label, large bold value, optional delta pill, light
 * outlined top-right icon. White card, 20px radius, soft shadow.
 */

type Tone = "default" | "positive" | "negative" | "warning";

interface StatCardProps {
	label: string;
	value: string;
	hint?: React.ReactNode;
	icon?: LucideIcon;
	tone?: Tone;
	delta?: {
		value: string;
		tone?: Tone;
	};
	href?: string;
	className?: string;
}

const valueToneCls: Record<Tone, string> = {
	default: "text-foreground",
	positive: "text-emerald-700 dark:text-emerald-400",
	negative: "text-rose-600 dark:text-rose-400",
	warning: "text-amber-700 dark:text-amber-500",
};

const deltaToneCls: Record<Tone, string> = {
	default: "bg-secondary text-foreground/80",
	positive: "bg-emerald-300 text-emerald-950 dark:bg-emerald-500/25 dark:text-emerald-200",
	negative: "bg-rose-300 text-rose-950 dark:bg-rose-500/25 dark:text-rose-200",
	warning: "bg-amber-300 text-amber-950 dark:bg-amber-500/25 dark:text-amber-200",
};

export function StatCard({
	label,
	value,
	hint,
	icon: Icon,
	tone = "default",
	delta,
	className,
}: StatCardProps) {
	const ArrowOrIcon = Icon ?? ArrowUpRight;
	return (
		<div
			className={cn(
				"group flex flex-col rounded-[16px] border border-border-subtle bg-card p-5 shadow-[var(--shadow-level-2)] transition-colors",
				className,
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<dt className="min-w-0 truncate text-[14.5px] font-medium text-muted-foreground">
					{label}
				</dt>
				<span className="grid size-8 shrink-0 place-items-center rounded-full border border-border-default text-muted-foreground">
					<ArrowOrIcon className="size-[15px]" aria-hidden strokeWidth={1.75} />
				</span>
			</div>
			<div className="mt-4 flex flex-wrap items-center gap-2">
				<dd className={cn("type-num-lg", valueToneCls[tone])}>{value}</dd>
				{delta ? (
					<span
						className={cn(
							"tabular inline-flex h-[22px] items-center rounded-full px-2.5 text-[11.5px] font-medium",
							deltaToneCls[delta.tone ?? "default"],
						)}
					>
						{delta.value}
					</span>
				) : null}
			</div>
			{hint ? (
				<p className="mt-2 text-[12.5px] leading-snug text-muted-foreground/90">
					{hint}
				</p>
			) : null}
		</div>
	);
}
