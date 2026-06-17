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
	const barFill =
		tone === "emerald" ? "#74c02f" : tone === "amber" ? "#fb6d39" : "#e5484d";
	const valueColor =
		tone === "emerald"
			? "text-emerald-600 dark:text-emerald-400"
			: tone === "amber"
				? "text-amber-600 dark:text-amber-400"
				: "text-rose-600 dark:text-rose-400";

	return (
		<div
			className={cn(
				"relative flex flex-col gap-3 overflow-hidden rounded-[16px] border border-border-subtle bg-card p-5 shadow-[var(--shadow-level-2)] transition-colors sm:p-6",
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
					<h3 className="text-[14px] font-medium text-muted-foreground">
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

			<div className="flex h-[18px] w-full items-stretch gap-1.5">
				{pct > 0 ? (
					<div
						className="rounded-[6px]"
						style={{ width: `${pct}%`, backgroundColor: barFill }}
					/>
				) : null}
				{pct < 100 ? (
					<div className="flex-1 rounded-[6px] bg-[repeating-linear-gradient(45deg,#dedcd4_0,#dedcd4_5px,#f1f0eb_5px,#f1f0eb_11px)]" />
				) : null}
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
