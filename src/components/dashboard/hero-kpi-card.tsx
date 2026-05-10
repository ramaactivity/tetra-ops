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

const ACCENT_BG: Record<Accent, string> = {
	navy: "bg-gradient-to-br from-slate-900 via-indigo-950 to-zinc-950",
	rose: "bg-gradient-to-br from-rose-950 via-rose-950/80 to-zinc-950",
	amber:
		"bg-gradient-to-br from-amber-950 via-amber-950/80 to-zinc-950",
	emerald:
		"bg-gradient-to-br from-emerald-950 via-emerald-900/60 to-zinc-950",
	primary: "bg-gradient-to-br from-primary/30 via-primary/15 to-zinc-950",
};

const ACCENT_GLOW: Record<Accent, string> = {
	navy: "shadow-[0_0_32px_-8px_rgb(99_102_241/0.35)]",
	rose: "shadow-[0_0_32px_-8px_rgb(244_63_94/0.4)]",
	amber: "shadow-[0_0_32px_-8px_rgb(245_158_11/0.35)]",
	emerald: "shadow-[0_0_32px_-8px_rgb(16_185_129/0.4)]",
	primary: "shadow-glow-crimson",
};

const ICON_BG: Record<Accent, string> = {
	navy: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/20",
	rose: "bg-rose-500/15 text-rose-300 ring-rose-500/20",
	amber: "bg-amber-500/15 text-amber-300 ring-amber-500/20",
	emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20",
	primary: "bg-primary/20 text-primary ring-primary/30",
};

const BADGE_BG: Record<Accent, string> = {
	navy: "bg-indigo-500/15 text-indigo-200 ring-indigo-500/20",
	rose: "bg-rose-500/15 text-rose-200 ring-rose-500/20",
	amber: "bg-amber-500/15 text-amber-200 ring-amber-500/20",
	emerald: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/20",
	primary: "bg-primary/20 text-primary-foreground ring-primary/30",
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
				"lift-on-hover relative flex min-h-[148px] flex-col gap-3 overflow-hidden rounded-2xl border border-border-default/40 p-5 ring-1 ring-white/5",
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
				<dt className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
					{label}
				</dt>
				<dd className="tabular truncate text-2xl font-bold text-white sm:text-3xl">
					{value}
				</dd>
				{hint ? (
					<p className="text-fluid-caption text-white/60">{hint}</p>
				) : null}
			</div>
		</div>
	);
}
