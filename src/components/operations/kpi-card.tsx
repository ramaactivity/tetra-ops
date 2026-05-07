import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "default" | "emerald" | "amber" | "sky" | "rose" | "primary";

const ACCENT_BG: Record<Accent, string> = {
	default: "bg-muted text-muted-foreground",
	emerald: "bg-emerald-500/10 text-emerald-500",
	amber: "bg-amber-500/10 text-amber-500",
	sky: "bg-sky-500/10 text-sky-500",
	rose: "bg-rose-500/10 text-rose-500",
	primary: "bg-primary/10 text-primary",
};

export function KpiCard({
	label,
	value,
	hint,
	icon: Icon,
	accent = "default",
}: {
	label: string;
	value: string;
	hint?: string;
	icon?: LucideIcon;
	accent?: Accent;
}) {
	return (
		<div className="border-border bg-card flex items-start gap-4 rounded-xl border p-5">
			{Icon && (
				<div
					className={cn(
						"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
						ACCENT_BG[accent],
					)}
				>
					<Icon className="h-5 w-5" />
				</div>
			)}
			<div className="min-w-0 space-y-0.5">
				<dt className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
					{label}
				</dt>
				<dd className="tabular text-foreground truncate text-2xl font-semibold">
					{value}
				</dd>
				{hint && (
					<p className="text-muted-foreground text-xs">{hint}</p>
				)}
			</div>
		</div>
	);
}
