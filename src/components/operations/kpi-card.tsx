import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * <KpiCard /> — UpGradely KPI tile.
 *
 * - White card, 20px radius, soft shadow, generous padding.
 * - Label: normal-case, medium weight, muted.
 * - Value: large bold tabular number; optional status pill beside it.
 * - Top-right: light outlined circle with the section icon (or a drill arrow).
 * - Optional progress: two segments (solid "done" + hatched "remaining").
 */

type Accent = "default" | "emerald" | "amber" | "sky" | "rose" | "primary";
type PillTone = "lime" | "orange" | "blue" | "red" | "neutral";

const FILL: Record<Accent, string> = {
	default: "#6d6c66",
	emerald: "#74c02f",
	amber: "#fb6d39",
	sky: "#2c8ee6",
	rose: "#e5484d",
	primary: "#18181b",
};

const PCT_TONE: Record<Accent, string> = {
	default: "text-foreground",
	emerald: "text-emerald-700 dark:text-emerald-400",
	amber: "text-amber-700 dark:text-amber-500",
	sky: "text-sky-700 dark:text-sky-400",
	rose: "text-rose-600 dark:text-rose-400",
	primary: "text-foreground",
};

const PILL_TONE: Record<PillTone, string> = {
	lime: "bg-emerald-300 text-emerald-950 dark:bg-emerald-500/25 dark:text-emerald-200",
	orange: "bg-amber-300 text-amber-950 dark:bg-amber-500/25 dark:text-amber-200",
	blue: "bg-sky-300 text-sky-950 dark:bg-sky-500/25 dark:text-sky-200",
	red: "bg-rose-300 text-rose-950 dark:bg-rose-500/25 dark:text-rose-200",
	neutral: "bg-secondary text-foreground/80",
};

interface KpiCardProps {
	label: string;
	value: string;
	hint?: string;
	icon?: LucideIcon;
	accent?: Accent;
	className?: string;
	/** Small status pill beside the value (e.g. "Cash", "8 event"). */
	badge?: string;
	badgeTone?: PillTone;
	/** Progress toward a target — two-segment hatched bar under the value. */
	progress?: { current: number; target: number; label?: string };
}

export function KpiCard({
	label,
	value,
	hint,
	icon: Icon,
	accent = "default",
	className,
	badge,
	badgeTone = "neutral",
	progress,
}: KpiCardProps) {
	const pct =
		progress && progress.target > 0
			? Math.round((progress.current / progress.target) * 100)
			: null;
	const done = pct === null ? 0 : Math.max(0, Math.min(100, pct));
	const ArrowOrIcon = Icon ?? ArrowUpRight;

	return (
		<div
			className={cn(
				"group flex flex-col rounded-[16px] border border-border-subtle bg-card p-5 shadow-[var(--shadow-level-2)] transition-colors",
				className,
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<dt className="min-w-0 text-[14.5px] font-medium text-balance text-muted-foreground">
					{label}
				</dt>
				<span className="grid size-8 shrink-0 place-items-center rounded-full border border-border-default text-muted-foreground">
					<ArrowOrIcon className="size-[15px]" aria-hidden strokeWidth={1.75} />
				</span>
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-2">
				<dd className="type-num-lg text-foreground">{value}</dd>
				{badge ? (
					<span
						className={cn(
							"inline-flex h-[22px] items-center rounded-full px-2.5 text-[11.5px] font-medium",
							PILL_TONE[badgeTone],
						)}
					>
						{badge}
					</span>
				) : null}
			</div>

			{hint ? (
				<p className="mt-2 text-[12.5px] leading-snug text-muted-foreground/90">
					{hint}
				</p>
			) : null}

			{pct !== null && progress ? (
				<div className="mt-4 flex flex-col gap-1.5">
					<div className="flex items-center justify-between text-[12px] leading-none">
						<span className="text-muted-foreground">
							{progress.label ??
								`Target ${progress.target.toLocaleString("id-ID")}`}
						</span>
						<span className={cn("tabular font-semibold", PCT_TONE[accent])}>
							{pct}%
						</span>
					</div>
					<div className="flex h-[14px] w-full items-stretch gap-1.5">
						{done > 0 ? (
							<div
								className="rounded-[6px]"
								style={{ width: `${done}%`, backgroundColor: FILL[accent] }}
							/>
						) : null}
						{done < 100 ? (
							<div className="flex-1 rounded-[6px] bg-[repeating-linear-gradient(45deg,#dedcd4_0,#dedcd4_4px,#f1f0eb_4px,#f1f0eb_9px)]" />
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
