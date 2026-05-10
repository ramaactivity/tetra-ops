import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * <TargetProgressCard /> — dashboard target tracker.
 *
 * Shows current/target counter with progress bar + remaining hint.
 * Bar tone shifts (rose → amber → emerald) as progress crosses
 * 33% / 66% thresholds — gives instant glanceable status.
 */

interface TargetProgressCardProps {
	label: string;
	current: number;
	target: number;
	icon?: LucideIcon;
	hint?: string;
	className?: string;
}

export function TargetProgressCard({
	label,
	current,
	target,
	icon: Icon,
	hint,
	className,
}: TargetProgressCardProps) {
	const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
	const remaining = Math.max(0, target - current);
	const tone =
		pct >= 100
			? "emerald"
			: pct >= 66
				? "emerald"
				: pct >= 33
					? "amber"
					: "rose";
	const barColor =
		tone === "emerald"
			? "bg-emerald-500"
			: tone === "amber"
				? "bg-amber-500"
				: "bg-rose-500";
	const valueColor =
		tone === "emerald"
			? "text-emerald-600 dark:text-emerald-400"
			: tone === "amber"
				? "text-amber-600 dark:text-amber-400"
				: "text-rose-600 dark:text-rose-400";

	return (
		<div
			className={cn(
				"lift-on-hover relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border-default bg-surface-2 p-4 sm:p-5",
				className,
			)}
		>
			<div className="flex items-baseline justify-between gap-2">
				<div className="flex items-center gap-2">
					{Icon ? (
						<div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
							<Icon className="size-4" aria-hidden />
						</div>
					) : null}
					<h3 className="text-fluid-caption font-semibold uppercase tracking-wider text-muted-foreground">
						{label}
					</h3>
				</div>
				<span className={cn("tabular text-fluid-caption font-semibold", valueColor)}>
					{Math.round(pct)}%
				</span>
			</div>

			<div className="flex items-baseline gap-2">
				<span className="tabular text-3xl font-bold text-foreground">
					{current.toLocaleString("id-ID")}
				</span>
				<span className="tabular text-sm text-muted-foreground">
					/ {target.toLocaleString("id-ID")}
				</span>
			</div>

			<div className="h-2 overflow-hidden rounded-full bg-muted">
				<div
					className={cn("h-full rounded-full transition-all", barColor)}
					style={{ width: `${pct}%` }}
				/>
			</div>

			{hint ? (
				<p className="text-fluid-caption text-muted-foreground">
					{hint}
				</p>
			) : pct >= 100 ? (
				<p className="text-fluid-caption font-medium text-emerald-600 dark:text-emerald-400">
					🎉 Target tercapai!
				</p>
			) : (
				<p className="text-fluid-caption text-muted-foreground">
					Kurang{" "}
					<span className="font-semibold text-foreground">
						{remaining.toLocaleString("id-ID")}
					</span>{" "}
					event lagi.
				</p>
			)}
		</div>
	);
}
