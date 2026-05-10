import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * <StatusGroupCard /> — dashboard tile that bundles 2-4 related counters
 * inline (e.g. "Status Operasional: Upcoming / Selesai / Batal").
 *
 * Each stat has its own tone for at-a-glance reading.
 */

type Tone = "primary" | "emerald" | "amber" | "rose" | "sky" | "muted";

const TONE_VALUE: Record<Tone, string> = {
	primary: "text-primary",
	emerald: "text-emerald-600 dark:text-emerald-400",
	amber: "text-amber-600 dark:text-amber-400",
	rose: "text-rose-600 dark:text-rose-400",
	sky: "text-sky-600 dark:text-sky-400",
	muted: "text-muted-foreground",
};

interface StatusStat {
	label: string;
	value: number | string;
	tone?: Tone;
}

interface StatusGroupCardProps {
	title: string;
	icon?: LucideIcon;
	stats: StatusStat[];
	className?: string;
}

export function StatusGroupCard({
	title,
	icon: Icon,
	stats,
	className,
}: StatusGroupCardProps) {
	return (
		<div
			className={cn(
				"lift-on-hover flex flex-col gap-3 rounded-xl border border-border-default bg-surface-2 p-4 sm:p-5",
				className,
			)}
		>
			<div className="flex items-center gap-2">
				{Icon ? (
					<div className="grid size-8 place-items-center rounded-lg bg-surface-3 text-muted-foreground">
						<Icon className="size-4" aria-hidden />
					</div>
				) : null}
				<h3 className="text-fluid-caption font-semibold uppercase tracking-wider text-muted-foreground">
					{title}
				</h3>
			</div>

			<dl
				className={cn(
					"grid gap-2",
					stats.length === 2 && "grid-cols-2",
					stats.length === 3 && "grid-cols-3",
					stats.length === 4 && "grid-cols-2 sm:grid-cols-4",
				)}
			>
				{stats.map((s) => (
					<div
						key={s.label}
						className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-surface-3/50 px-2 py-3 text-center"
					>
						<dd
							className={cn(
								"tabular text-2xl font-bold leading-none",
								TONE_VALUE[s.tone ?? "muted"],
							)}
						>
							{s.value}
						</dd>
						<dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
							{s.label}
						</dt>
					</div>
				))}
			</dl>
		</div>
	);
}
