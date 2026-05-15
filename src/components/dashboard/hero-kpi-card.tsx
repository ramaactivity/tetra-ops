import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <HeroKpiCard /> — dashboard executive-summary tile.
 *
 * Tetra ERP exec-summary parity: dramatic dark gradient backgrounds,
 * big tabular value, glassy icon pill, and an optional top-right badge
 * for secondary metrics ("65.9% Margin", "Kas Masuk Rp 70jt", etc).
 *
 * Use sparingly — meant for the top-of-dashboard strip, not as a
 * general KPI replacement (use <KpiCard/> for those).
 */

type Accent = "navy" | "rose" | "amber" | "emerald" | "primary";

/* DEPRECATED: HeroKpiCard's gradient + glow signature has been retired
   per "no gradients anywhere" direction. Component kept as a legacy
   alias — accent now just toggles the icon ring tint. New code should
   use <StatCard /> from src/components/ui/stat-card.tsx instead. */
const ACCENT_BG: Record<Accent, string> = {
	navy: "bg-card",
	rose: "bg-card",
	amber: "bg-card",
	emerald: "bg-card",
	primary: "bg-card",
};

const ACCENT_GLOW: Record<Accent, string> = {
	navy: "",
	rose: "",
	amber: "",
	emerald: "",
	primary: "",
};

const ICON_BG: Record<Accent, string> = {
	navy: "bg-primary/10 text-primary ring-primary/20",
	rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
	amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
	emerald:
		"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
	primary: "bg-primary/10 text-primary ring-primary/20",
};

const BADGE_BG: Record<Accent, string> = {
	navy: "bg-primary/10 text-primary ring-primary/20",
	rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
	amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
	emerald:
		"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
	primary: "bg-primary/10 text-primary ring-primary/20",
};

interface HeroKpiCardProps {
	label: string;
	value: string;
	hint?: React.ReactNode;
	icon?: LucideIcon;
	accent?: Accent;
	badge?: {
		label: string;
		value: string;
	};
	className?: string;
}

export function HeroKpiCard({
	label,
	value,
	hint,
	icon: Icon,
	accent = "navy",
	badge,
	className,
}: HeroKpiCardProps) {
	return (
		<div
			className={cn(
				"relative flex min-h-[148px] flex-col gap-3 overflow-hidden rounded-2xl border border-border-default bg-card p-5 transition-colors hover:bg-surface-3",
				ACCENT_BG[accent],
				ACCENT_GLOW[accent],
				className,
			)}
		>
			<div className="flex items-start justify-between gap-2">
				{Icon ? (
					<div
						className={cn(
							"grid size-10 shrink-0 place-items-center rounded-xl ring-1 backdrop-blur-sm",
							ICON_BG[accent],
						)}
					>
						<Icon className="size-5" aria-hidden />
					</div>
				) : (
					<span aria-hidden className="size-10" />
				)}
				{badge ? (
					<div
						className={cn(
							"flex flex-col items-end rounded-lg px-2.5 py-1.5 ring-1 backdrop-blur-sm",
							BADGE_BG[accent],
						)}
					>
						<span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">
							{badge.label}
						</span>
						<span className="tabular text-[11px] font-bold leading-none">
							{badge.value}
						</span>
					</div>
				) : null}
			</div>

			<div className="mt-auto space-y-1">
				<dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
					{label}
				</dt>
				<dd className="tabular truncate text-2xl font-bold text-foreground sm:text-3xl">
					{value}
				</dd>
				{hint ? (
					<p className="text-fluid-caption text-muted-foreground">{hint}</p>
				) : null}
			</div>
		</div>
	);
}
