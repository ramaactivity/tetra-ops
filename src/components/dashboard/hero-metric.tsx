import { TrendingDown, TrendingUp } from "lucide-react";
import { Sparkline } from "@/components/dashboard/sparkline";

/**
 * <HeroMetric /> — the dashboard's tier-1 card: one flagship number, big and
 * unmissable, on a flat emerald fill (the brand's single action hue — NO
 * gradient). Number is full-width so long Rupiah values never truncate.
 * Optional delta pill ("+x% vs last month") and a white sparkline of the trend.
 */
export function HeroMetric({
	label,
	value,
	deltaPct,
	deltaLabel,
	spark,
	hint,
}: {
	label: string;
	value: string;
	deltaPct?: number | null;
	deltaLabel?: string;
	spark?: number[];
	hint?: string;
}) {
	const up = (deltaPct ?? 0) >= 0;
	return (
		<div className="relative overflow-hidden rounded-[16px] bg-primary p-5 text-white shadow-[var(--shadow-fab)] dark:bg-primary">
			<div className="flex items-start justify-between gap-3">
				<p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-white/75">
					{label}
				</p>
				{deltaPct != null ? (
					<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[12px] font-semibold tabular">
						{up ? (
							<TrendingUp className="size-3.5" aria-hidden />
						) : (
							<TrendingDown className="size-3.5" aria-hidden />
						)}
						{up ? "+" : ""}
						{deltaPct}%
						{deltaLabel ? (
							<span className="font-normal text-white/70">&nbsp;{deltaLabel}</span>
						) : null}
					</span>
				) : null}
			</div>

			<div className="type-num-xl mt-2 tabular leading-none text-white">
				{value}
			</div>
			{hint ? <p className="mt-1.5 text-[13px] text-white/75">{hint}</p> : null}

			{spark && spark.length > 0 ? (
				<div className="mt-3 -mb-1">
					<Sparkline data={spark} stroke="white" fill="white" className="h-10" />
				</div>
			) : null}
		</div>
	);
}
