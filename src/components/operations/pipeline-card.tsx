import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * <PipelineCard /> — clickable count tile that drills into a filter view.
 *
 * A3 refactor (sesi 5):
 * - Surface-2 base, surface-3 hover (Linear/Vercel restraint — color only).
 * - Accent stays on icon only (semantic emerald/amber/sky/rose/primary).
 * - Fluid type for the count, caption-style label.
 */

type Accent = "emerald" | "amber" | "sky" | "rose" | "primary";

const ACCENT_TEXT: Record<Accent, string> = {
	emerald: "text-emerald-500",
	amber: "text-amber-500",
	sky: "text-sky-500",
	rose: "text-rose-500",
	primary: "text-primary",
};

const ACCENT_HOVER_BG: Record<Accent, string> = {
	emerald: "group-hover:bg-emerald-500/10",
	amber: "group-hover:bg-amber-500/10",
	sky: "group-hover:bg-sky-500/10",
	rose: "group-hover:bg-rose-500/10",
	primary: "group-hover:bg-primary/15",
};

export function PipelineCard({
	label,
	count,
	href,
	icon: Icon,
	accent = "primary",
}: {
	label: string;
	count: number;
	href: string;
	icon: LucideIcon;
	accent?: Accent;
}) {
	return (
		<Link
			href={href}
			className="group flex flex-col gap-3 rounded-[16px] border border-border-default bg-card p-4 transition-colors hover:bg-surface-3 sm:p-5"
		>
			<div
				className={cn(
					"grid size-9 place-items-center rounded-lg bg-surface-3 transition-colors duration-fast ease-out-expo",
					ACCENT_TEXT[accent],
					ACCENT_HOVER_BG[accent],
				)}
			>
				<Icon className="size-5" aria-hidden />
			</div>
			<div className="space-y-0.5">
				<div className="tabular text-fluid-h1 font-semibold text-foreground">
					{count.toLocaleString("id-ID")}
				</div>
				<div className="text-fluid-caption font-medium uppercase tracking-wider text-muted-foreground">
					{label}
				</div>
			</div>
		</Link>
	);
}
