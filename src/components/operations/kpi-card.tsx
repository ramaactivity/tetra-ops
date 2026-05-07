import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * <KpiCard /> — dashboard / list-page metric tile.
 *
 * A3 refactor (sesi 5):
 * - Surface-2 base, border-default. lift-on-hover utility for tactile
 *   feedback on desktop (no-op on touch via @media guard).
 * - Optional `variant="hero"` adds Sunrise gradient overlay at low
 *   opacity + glow shadow, for the primary hero KPI per design system §12.
 * - Accent semantic colors stay (emerald, amber, sky, rose, primary)
 *   for the icon tile only — never on the card body.
 * - Fluid type: text-fluid-h2 for the value, text-fluid-caption labels.
 */

type Accent = "default" | "emerald" | "amber" | "sky" | "rose" | "primary";

const ACCENT_BG: Record<Accent, string> = {
	default: "bg-surface-3 text-muted-foreground",
	emerald: "bg-emerald-500/10 text-emerald-500",
	amber: "bg-amber-500/10 text-amber-500",
	sky: "bg-sky-500/10 text-sky-500",
	rose: "bg-rose-500/10 text-rose-500",
	primary: "bg-primary/15 text-primary",
};

const cardVariants = cva(
	"lift-on-hover relative flex items-start gap-4 overflow-hidden rounded-xl border p-4 sm:p-5",
	{
		variants: {
			variant: {
				default: "border-border-default bg-surface-2",
				hero: "border-border-default bg-surface-2 shadow-glow-crimson/40 dark:shadow-glow-crimson",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

interface KpiCardProps extends VariantProps<typeof cardVariants> {
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
	variant = "default",
	className,
}: KpiCardProps) {
	return (
		<div className={cn(cardVariants({ variant }), className)}>
			{variant === "hero" ? (
				<div
					aria-hidden
					className="absolute inset-0 -z-10 bg-gradient-sunrise-radial opacity-[0.08] dark:opacity-[0.14]"
				/>
			) : null}
			{Icon && (
				<div
					className={cn(
						"grid size-10 shrink-0 place-items-center rounded-lg",
						ACCENT_BG[accent],
					)}
				>
					<Icon className="size-5" aria-hidden />
				</div>
			)}
			<div className="min-w-0 flex-1 space-y-0.5">
				<dt className="text-fluid-caption font-medium uppercase tracking-wider text-muted-foreground">
					{label}
				</dt>
				<dd className="tabular truncate text-fluid-h2 font-semibold text-foreground">
					{value}
				</dd>
				{hint && (
					<p className="text-fluid-caption text-muted-foreground">{hint}</p>
				)}
			</div>
		</div>
	);
}
