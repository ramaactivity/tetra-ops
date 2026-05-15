import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <StatCard /> — Linear / Vercel DNA KPI tile.
 *
 * Plain card surface (`bg-card`) with 1px hairline border. NO painted
 * gradients, NO atmospheric color fills. Hierarchy carried by:
 *   - Eyebrow label (uppercase, muted, +tracking)
 *   - Big tabular value (22px / weight 600 / tracking-tight)
 *   - Optional muted hint line
 *   - Optional delta chip (semantic positive/negative)
 *   - Optional href → renders as a Link with hover lift
 *
 * Replaces HeroKpiCard's loud gradient treatment. Per DESIGN.md:
 *   "Don't paint stat cards with rich gradients — that's the Linear /
 *    Vercel signature."
 */

type Tone = "default" | "positive" | "negative" | "warning";

interface StatCardProps {
	label: string;
	value: string;
	hint?: React.ReactNode;
	icon?: LucideIcon;
	/** Subtle color treatment of the value text — for semantic emphasis. */
	tone?: Tone;
	/** Optional delta chip (right-aligned in header). Tone auto-mapped. */
	delta?: {
		value: string;
		tone?: Tone;
	};
	/** When set, renders as a Link with hover lift. */
	href?: string;
	className?: string;
}

const valueToneCls: Record<Tone, string> = {
	default: "text-foreground",
	positive: "text-emerald-600 dark:text-emerald-400",
	negative: "text-rose-600 dark:text-rose-400",
	warning: "text-amber-600 dark:text-amber-400",
};

const deltaToneCls: Record<Tone, string> = {
	default: "bg-surface-3 text-muted-foreground ring-border-subtle",
	positive:
		"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
	negative:
		"bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
	warning:
		"bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
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
				"group flex flex-col gap-3 rounded-xl border border-border-default bg-surface-2 p-5 transition-colors hover:bg-surface-3",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<p className="eyebrow !text-[10px] !tracking-widest">{label}</p>
				{Icon ? (
					<Icon
						aria-hidden
						className="size-3.5 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground"
					/>
				) : delta ? (
					<span
						className={cn(
							"tabular inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-semibold ring-1",
							deltaToneCls[delta.tone ?? "default"],
						)}
					>
						{delta.value}
					</span>
				) : null}
			</div>

			<div className="flex flex-col gap-1">
				<p
					className={cn(
						"tabular text-[22px] font-semibold leading-none tracking-tight",
						valueToneCls[tone],
					)}
				>
					{value}
				</p>
				{hint ? (
					<p className="text-[11px] text-muted-foreground">{hint}</p>
				) : null}
			</div>
		</div>
	);
}
