import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * <KpiCard /> — dashboard / list-page metric tile.
 *
 * Pass 4 refactor per DESIGN.md (Vercel/Linear DNA, no gradients):
 * - Plain card surface (`bg-card`) + hairline border. NO atmospheric
 *   gradient overlays, NO glow shadows.
 * - `variant="hero"` just promotes the icon to Iris primary tint —
 *   no painted background, no shadow ring.
 * - Accent semantic colors (emerald/amber/sky/rose/primary) for the
 *   icon tile only — never on the card body.
 */

type Accent = "default" | "emerald" | "amber" | "sky" | "rose" | "primary";

const ACCENT_BG: Record<Accent, string> = {
	default: "bg-surface-3 text-muted-foreground ring-border-subtle",
	emerald:
		"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/15",
	amber:
		"bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/15",
	sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/15",
	rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/15",
	primary: "bg-primary/10 text-primary ring-primary/20",
};

const cardVariants = cva(
	"group relative flex items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-surface-3 sm:p-5",
	{
		variants: {
			variant: {
				default: "border-border-default bg-card",
				hero: "border-border-default bg-card",
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
	// Hero variant: promote icon accent to primary if caller didn't specify.
	const resolvedAccent =
		variant === "hero" && accent === "default" ? "primary" : accent;
	return (
		<div className={cn(cardVariants({ variant }), className)}>
			{Icon && (
				<div
					className={cn(
						"grid size-10 shrink-0 place-items-center rounded-lg ring-1",
						ACCENT_BG[resolvedAccent],
					)}
				>
					<Icon className="size-4" aria-hidden />
				</div>
			)}
			<div className="min-w-0 flex-1 space-y-1">
				<dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
					{label}
				</dt>
				<dd className="tabular truncate text-[22px] font-semibold leading-tight tracking-tight text-foreground">
					{value}
				</dd>
				{hint && (
					<p className="text-[11px] leading-tight text-muted-foreground">
						{hint}
					</p>
				)}
			</div>
		</div>
	);
}
