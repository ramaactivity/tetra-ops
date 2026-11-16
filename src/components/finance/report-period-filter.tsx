import Link from "next/link";
import { MonthSwitcher } from "@/components/finance/monthly/month-switcher";
import { PERIOD_PRESETS, type ReportPeriod } from "@/lib/finance/report-period";
import { cn } from "@/lib/utils";

/**
 * Filter periode Laporan di Ringkasan: pintasan rentang (bulan ini … semua)
 * + pemilih satu bulan. Tautan biasa (bisa di-share), tanpa lompat ke atas.
 */
export function ReportPeriodFilter({
	period,
	months,
	labelOf,
	prevYm,
	nextYm,
}: {
	period: ReportPeriod;
	/** Bulan yang punya data, ASC. */
	months: string[];
	labelOf: Record<string, string>;
	prevYm: string | null;
	nextYm: string | null;
}) {
	const single = period.months === 1 && !period.preset?.startsWith("3");
	return (
		<div className="flex flex-wrap items-center gap-2">
			<nav
				aria-label="Periode laporan"
				className="hide-scrollbar flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-secondary p-0.5"
			>
				{PERIOD_PRESETS.map((p) => {
					const active = period.preset === p.key;
					return (
						<Link
							key={p.key}
							href={`/finance?periode=${p.key}`}
							scroll={false}
							aria-current={active ? "true" : undefined}
							className={cn(
								"inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-medium transition-colors",
								active
									? "bg-card text-foreground shadow-[var(--shadow-level-1)]"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{p.label}
						</Link>
					);
				})}
			</nav>
			<MonthSwitcher
				months={months}
				current={single ? period.from : ""}
				placeholder="Pilih bulan"
				prevYm={single ? prevYm : null}
				nextYm={single ? nextYm : null}
				labelOf={labelOf}
			/>
		</div>
	);
}
