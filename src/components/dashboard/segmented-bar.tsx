import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * <SegmentedBar /> — a breakdown shown as ONE proportional stacked bar + a
 * legend (dot · label · count). Replaces the cramped 3-column mini-stat grid
 * that overlapped on phones: here nothing can collide, the proportion is
 * glanceable, and it stays compact. Used for Status Invoice / Status Operasional.
 */

type Tone = "emerald" | "amber" | "rose" | "teal" | "sky" | "neutral";

const SEG_BG: Record<Tone, string> = {
	emerald: "bg-emerald-500",
	amber: "bg-amber-500",
	rose: "bg-rose-500",
	teal: "bg-teal-500",
	sky: "bg-sky-500",
	neutral: "bg-muted-foreground/40",
};

const DOT: Record<Tone, string> = SEG_BG;

const TEXT: Record<Tone, string> = {
	emerald: "text-emerald-700 dark:text-emerald-400",
	amber: "text-amber-700 dark:text-amber-500",
	rose: "text-rose-600 dark:text-rose-400",
	teal: "text-teal-700 dark:text-teal-400",
	sky: "text-sky-700 dark:text-sky-400",
	neutral: "text-muted-foreground",
};

export function SegmentedBar({
	title,
	icon,
	segments,
}: {
	title: string;
	icon?: React.ReactNode;
	segments: Array<{ label: string; value: number; tone: Tone }>;
}) {
	const total = segments.reduce((s, x) => s + x.value, 0);
	return (
		<div className="flex flex-col gap-3 rounded-[16px] border border-border-default bg-card p-4 shadow-[var(--shadow-soft)]">
			<div className="flex items-center gap-2">
				{icon ? (
					<span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted-foreground [&_svg]:size-4">
						{icon}
					</span>
				) : null}
				<h3 className="eyebrow">{title}</h3>
			</div>

			<div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3">
				{total > 0
					? segments.map((s) =>
							s.value > 0 ? (
								<div
									key={s.label}
									className={cn("h-full", SEG_BG[s.tone])}
									style={{ width: `${(s.value / total) * 100}%` }}
								/>
							) : null,
						)
					: null}
			</div>

			<div className="flex flex-wrap gap-x-4 gap-y-1.5">
				{segments.map((s) => (
					<div key={s.label} className="flex items-center gap-1.5">
						<span className={cn("size-2 shrink-0 rounded-full", DOT[s.tone])} />
						<span className="type-caption text-foreground">{s.label}</span>
						<span className={cn("type-num text-[13px] font-semibold", TEXT[s.tone])}>
							{s.value}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
