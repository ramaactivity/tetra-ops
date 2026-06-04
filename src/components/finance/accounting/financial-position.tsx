import { Check, TriangleAlert } from "lucide-react";
import type { PositionSummary } from "@/lib/finance/accounting";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * <FinancialPosition /> — the first thing the owner reads on Akuntansi.
 *
 * Answers the two plain questions before any ledger mechanics: how much does
 * the business have (total assets + the liquid cash slice), and do the books
 * still balance. The accounting equation (Aset = Kewajiban + Ekuitas, with
 * laba berjalan folded into equity) is shown as the standing proof.
 *
 * One white card, hairline structure, numbers carry the hierarchy. No metric
 * grid, no decorative color — emerald/red appear only to signal balance state.
 */
export function FinancialPosition({
	position,
	asOfLabel,
}: {
	position: PositionSummary;
	asOfLabel: string;
}) {
	const {
		assets,
		liabilities,
		equity,
		netIncome,
		cash,
		equationDiff,
		booksBalanced,
	} = position;

	const cashShare = assets > 0 ? Math.round((cash / assets) * 100) : 0;
	const equationOk = Math.abs(equationDiff) < 1;

	return (
		<section
			aria-label="Posisi keuangan"
			className="overflow-hidden rounded-lg border border-border-default bg-card shadow-[var(--shadow-level-2)]"
		>
			{/* Header — section eyebrow + the single trust signal */}
			<div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
				<span className="eyebrow">Posisi keuangan · {asOfLabel}</span>
				<BalanceSignal balanced={booksBalanced} diff={equationDiff} />
			</div>

			{/* Headline figures — total assets dominant, cash as the liquid slice */}
			<div className="grid gap-5 px-5 py-5 sm:grid-cols-[1.4fr_1fr] sm:gap-8 sm:py-6">
				<div>
					<div className="eyebrow mb-1.5">Total aset</div>
					<div className="tabular display-tight text-[32px] font-semibold leading-[1.05] text-foreground sm:text-[40px]">
						{formatRupiah(assets)}
					</div>
					<p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
						Semua yang dimiliki bisnis saat ini.
					</p>
				</div>
				<div className="sm:border-l sm:border-border-subtle sm:pl-8">
					<div className="eyebrow mb-1.5">Kas &amp; bank</div>
					<div className="tabular text-[22px] font-semibold leading-tight text-foreground sm:text-[26px]">
						{formatRupiah(cash)}
					</div>
					<p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
						{cashShare}% dari aset · uang yang benar-benar likuid.
					</p>
				</div>
			</div>

			{/* The accounting equation — standing proof the books hang together */}
			<div className="border-t border-border-subtle bg-secondary/40 px-5 py-4">
				<div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
					<EquationTerm label="Aset" value={assets} />
					<Operator symbol="=" />
					<EquationTerm label="Kewajiban" value={liabilities} />
					<Operator symbol="+" />
					<EquationTerm
						label="Ekuitas"
						value={equity}
						hint={
							netIncome !== 0
								? `termasuk laba berjalan ${formatRupiah(netIncome)}`
								: undefined
						}
					/>
				</div>
				{!equationOk && (
					<p className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-destructive">
						<TriangleAlert className="size-3.5" aria-hidden />
						Persamaan tidak seimbang — selisih{" "}
						{formatRupiah(Math.abs(equationDiff))}. Cek jurnal terakhir.
					</p>
				)}
			</div>
		</section>
	);
}

function BalanceSignal({
	balanced,
	diff,
}: {
	balanced: boolean;
	diff: number;
}) {
	if (balanced) {
		return (
			<span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
				<Check className="size-3.5" aria-hidden strokeWidth={2.5} />
				Buku berimbang
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
			<TriangleAlert className="size-3.5" aria-hidden />
			Tidak berimbang · selisih {formatRupiah(Math.abs(diff))}
		</span>
	);
}

function EquationTerm({
	label,
	value,
	hint,
}: {
	label: string;
	value: number;
	hint?: string;
}) {
	return (
		<div className="flex items-baseline justify-between gap-2 sm:block">
			<div className="eyebrow sm:mb-1">{label}</div>
			<div className="text-right sm:text-left">
				<div
					className={cn(
						"tabular text-[15px] font-semibold leading-tight sm:text-[17px]",
						value < 0 ? "text-destructive" : "text-foreground",
					)}
				>
					{formatRupiah(value)}
				</div>
				{hint && (
					<div className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
						{hint}
					</div>
				)}
			</div>
		</div>
	);
}

function Operator({ symbol }: { symbol: string }) {
	return (
		<div
			aria-hidden
			className="hidden select-none text-center text-[18px] font-medium text-muted-foreground/50 sm:block"
		>
			{symbol}
		</div>
	);
}
