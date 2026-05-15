import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <StatCard /> — Vercel KPI tile (alternate to KpiCard).
 *
 * Same Vercel chrome (white card, hairline border, mono eyebrow, tabular
 * display-md value) but supports an optional delta chip and links.
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
	default: "bg-secondary text-muted-foreground",
	positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	negative: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
	warning: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
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
	return (
		<div
			className={cn(
				"group flex flex-col gap-3 rounded-lg border border-border-default bg-card p-5 transition-colors hover:bg-secondary/40",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<dt className="eyebrow truncate">{label}</dt>
				{Icon ? (
					<Icon
						aria-hidden
						className="size-3.5 text-muted-foreground/70"
						strokeWidth={2}
					/>
				) : delta ? (
					<span
						className={cn(
							"tabular inline-flex h-[18px] items-center rounded-full px-2 text-[10.5px] font-medium",
							deltaToneCls[delta.tone ?? "default"],
						)}
					>
						{delta.value}
					</span>
				) : null}
			</div>
			<div className="flex flex-col gap-1">
				<dd
					className={cn(
						"tabular display-tight truncate text-[26px] font-semibold leading-[1.1]",
						valueToneCls[tone],
					)}
				>
					{value}
				</dd>
				{hint ? (
					<p className="text-[12px] leading-snug text-muted-foreground">
						{hint}
					</p>
				) : null}
			</div>
		</div>
	);
}
