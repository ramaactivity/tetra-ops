import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * <KpiCard /> — Vercel `card-marketing` rendered as a KPI tile.
 *
 * - Pure white card on canvas-soft page bg (level-1 hairline elevation).
 * - Icon sits in a square 32px chip (canvas-soft fill, body-tone glyph).
 *   The accent prop maps to subtle tints only — Vercel keeps icons quiet.
 * - Label = caption-mono uppercase (`.eyebrow` utility).
 * - Value = display-md tabular (24px / 600 / -0.96px) — Vercel signature
 *   negative-tracking pulled in for big-number scan.
 * - Hint = body-sm body tone (#525252).
 */

type Accent = "default" | "emerald" | "amber" | "sky" | "rose" | "primary";

const ICON_TINT: Record<Accent, string> = {
	default: "bg-secondary text-muted-foreground",
	emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	amber: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
	sky: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
	rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
	primary: "bg-foreground/8 text-foreground",
};

const BAR_FILL: Record<Accent, string> = {
	default: "bg-muted-foreground",
	emerald: "bg-emerald-500",
	amber: "bg-amber-500",
	sky: "bg-teal-500",
	rose: "bg-rose-500",
	primary: "bg-foreground",
};

const PCT_TONE: Record<Accent, string> = {
	default: "text-foreground",
	emerald: "text-emerald-600 dark:text-emerald-400",
	amber: "text-amber-700 dark:text-amber-500",
	sky: "text-teal-600 dark:text-teal-400",
	rose: "text-rose-600 dark:text-rose-400",
	primary: "text-foreground",
};

interface KpiCardProps {
	label: string;
	value: string;
	hint?: string;
	icon?: LucideIcon;
	accent?: Accent;
	className?: string;
	/** Progress toward a target — renders a labeled bar under the value. The
	 * left caption defaults to "Target N"; pass `label` to override (e.g. a
	 * completion ratio that isn't a goal), or "" to show only the percentage. */
	progress?: { current: number; target: number; label?: string };
}

export function KpiCard({
	label,
	value,
	hint,
	icon: Icon,
	accent = "default",
	className,
	progress,
}: KpiCardProps) {
	const pct =
		progress && progress.target > 0
			? Math.round((progress.current / progress.target) * 100)
			: null;
	return (
		<div
			className={cn(
				"group flex flex-col gap-3 rounded-[1.25rem] border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)] transition-colors hover:bg-secondary/40 sm:p-5",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<dt className="eyebrow min-w-0 text-balance">{label}</dt>
				{Icon ? (
					<div
						className={cn(
							"grid size-8 shrink-0 place-items-center rounded-xl",
							ICON_TINT[accent],
						)}
					>
						<Icon className="size-4" aria-hidden strokeWidth={2} />
					</div>
				) : null}
			</div>
			<div className="flex flex-col gap-1">
				<dd className="type-num-lg truncate text-foreground">{value}</dd>
				{hint && <p className="type-caption leading-snug">{hint}</p>}
			</div>
			{pct !== null && progress && (
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between text-[12px] leading-none">
						<span className="text-muted-foreground">
							{progress.label ??
								`Target ${progress.target.toLocaleString("id-ID")}`}
						</span>
						<span className={cn("tabular font-semibold", PCT_TONE[accent])}>
							{pct}%
						</span>
					</div>
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
						<div
							className={cn("h-full rounded-full", BAR_FILL[accent])}
							style={{ width: `${Math.min(100, pct)}%` }}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
