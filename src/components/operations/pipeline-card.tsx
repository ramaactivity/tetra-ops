import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "amber" | "sky" | "rose" | "primary";

const ACCENT_CLASSES: Record<Accent, string> = {
	emerald: "text-emerald-500 group-hover:bg-emerald-500/10",
	amber: "text-amber-500 group-hover:bg-amber-500/10",
	sky: "text-sky-500 group-hover:bg-sky-500/10",
	rose: "text-rose-500 group-hover:bg-rose-500/10",
	primary: "text-primary group-hover:bg-primary/10",
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
			className="group border-border bg-card hover:border-foreground/20 flex flex-col gap-3 rounded-xl border p-5 transition-colors"
		>
			<div
				className={cn(
					"flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
					ACCENT_CLASSES[accent],
					"bg-muted",
				)}
			>
				<Icon className="h-5 w-5" />
			</div>
			<div className="space-y-0.5">
				<div className="tabular text-foreground text-3xl font-semibold">
					{count.toLocaleString("id-ID")}
				</div>
				<div className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
					{label}
				</div>
			</div>
		</Link>
	);
}
