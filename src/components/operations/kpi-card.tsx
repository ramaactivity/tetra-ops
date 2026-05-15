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
	sky: "bg-[#0070f3]/10 text-[#0070f3] dark:text-[#3b96ff]",
	rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
	primary: "bg-foreground/8 text-foreground",
};

interface KpiCardProps {
	label: string;
	value: string;
	hint?: string;
	icon?: LucideIcon;
	accent?: Accent;
	className?: string;
}

export function KpiCard({
	label,
	value,
	hint,
	icon: Icon,
	accent = "default",
	className,
}: KpiCardProps) {
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
					<div
						className={cn(
							"grid size-7 shrink-0 place-items-center rounded-md",
							ICON_TINT[accent],
						)}
					>
						<Icon className="size-3.5" aria-hidden strokeWidth={2} />
					</div>
				) : null}
			</div>
			<div className="flex flex-col gap-1">
				<dd className="tabular display-tight truncate text-[26px] font-semibold leading-[1.1] text-foreground">
					{value}
				</dd>
				{hint && (
					<p className="text-[12px] leading-snug text-muted-foreground">
						{hint}
					</p>
				)}
			</div>
		</div>
	);
}
