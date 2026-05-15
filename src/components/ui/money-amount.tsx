import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";
type Tone = "auto" | "default" | "muted" | "positive" | "negative";

/**
 * <MoneyAmount /> — inline money rendering per Tetra DESIGN.md.
 *
 * Always tabular figures (vertical alignment in tables / P&L breakdowns).
 * Auto tone: positive values render in success color when context says
 * `tone="auto"` AND value > 0; negative values render in danger when
 * value < 0. Set `tone="default"` for neutral display (revenue, balances).
 *
 * Sizes map to DESIGN.md tokens:
 *   sm  → tabular-sm  (12px, weight 500) — dense rows, chips
 *   md  → tabular     (14px, weight 500) — default P&L line items
 *   lg  → tabular-lg  (22px, weight 600) — subtotals, stat cards
 */
export function MoneyAmount({
	value,
	size = "md",
	tone = "default",
	className,
	showSign = false,
}: {
	value: number;
	size?: Size;
	tone?: Tone;
	className?: string;
	showSign?: boolean;
}) {
	const resolvedTone =
		tone === "auto"
			? value > 0
				? "positive"
				: value < 0
					? "negative"
					: "default"
			: tone;

	const colorCls =
		resolvedTone === "positive"
			? "text-emerald-600 dark:text-emerald-400"
			: resolvedTone === "negative"
				? "text-rose-600 dark:text-rose-400"
				: resolvedTone === "muted"
					? "text-muted-foreground"
					: "text-foreground";

	const sizeCls =
		size === "lg"
			? "text-[22px] font-semibold tracking-tight leading-tight"
			: size === "sm"
				? "text-xs font-medium"
				: "text-sm font-medium";

	const sign =
		showSign && value > 0
			? "+ "
			: value < 0
				? "− "
				: "";

	return (
		<span className={cn("tabular", sizeCls, colorCls, className)}>
			{sign}
			{formatRupiah(Math.abs(value))}
		</span>
	);
}
