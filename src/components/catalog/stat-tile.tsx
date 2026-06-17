import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * <StatTile /> — compact KPI tile used across the operations catalog pages
 * (Paket, Add-on, Backdrop). Pure white card on canvas-soft, mono eyebrow
 * label, tabular value, square accent icon chip. No gradients.
 */

export type StatAccent = "default" | "emerald" | "amber" | "info";

const ICON_TINT: Record<StatAccent, string> = {
	default: "bg-secondary text-muted-foreground",
	emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	amber: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
	info: "bg-[#0070f3]/10 text-[#0070f3] dark:text-[#3b96ff]",
};

export interface StatItem {
	label: string;
	value: string;
	hint?: string;
	icon: LucideIcon;
	accent?: StatAccent;
}

export function StatTile({
	label,
	value,
	hint,
	icon: Icon,
	accent = "default",
}: StatItem) {
	return (
		<div className="border-border-default bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-[var(--shadow-level-2)]">
			<div className="flex items-center justify-between gap-2">
				<span className="eyebrow text-muted-foreground truncate">{label}</span>
				<div
					className={cn(
						"grid size-7 shrink-0 place-items-center rounded-lg",
						ICON_TINT[accent],
					)}
				>
					<Icon className="size-4" aria-hidden strokeWidth={2} />
				</div>
			</div>
			<div className="flex flex-col gap-0.5">
				<span className="tabular text-foreground text-[22px] leading-none font-semibold tracking-tight">
					{value}
				</span>
				{hint ? (
					<span className="type-caption text-muted-foreground">{hint}</span>
				) : null}
			</div>
		</div>
	);
}

export function StatRow({ stats }: { stats: StatItem[] }) {
	return (
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			{stats.map((s) => (
				<StatTile key={s.label} {...s} />
			))}
		</div>
	);
}
