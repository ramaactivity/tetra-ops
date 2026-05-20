"use client";

import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRupiah } from "@/lib/format";
import type { AccountAggregate } from "./trial-balance-table";

export function ProfitLossTable({
	rows,
	from,
	to,
}: {
	rows: AccountAggregate[];
	from?: string;
	to?: string;
}) {
	if (rows.length === 0) {
		return (
			<EmptyState
				title="Belum ada transaksi"
				description={
					from || to
						? "Tidak ada revenue / beban di periode ini."
						: "Settle event atau catat Beban dulu untuk lihat laporan ini."
				}
			/>
		);
	}

	const revenueRows = rows.filter((r) => r.account_type === "revenue");
	// Split expenses: HPP (5-1xx) vs OpEx (5-2xx and above)
	const hppRows = rows.filter(
		(r) =>
			r.account_type === "expense" &&
			/^5-1\d{2}$/.test(r.code),
	);
	const opexRows = rows.filter(
		(r) =>
			r.account_type === "expense" &&
			!/^5-1\d{2}$/.test(r.code),
	);

	const totalRevenue = revenueRows.reduce((s, r) => s + r.balance, 0);
	const totalHpp = hppRows.reduce((s, r) => s + r.balance, 0);
	const totalOpex = opexRows.reduce((s, r) => s + r.balance, 0);
	const grossProfit = totalRevenue - totalHpp;
	const netProfit = grossProfit - totalOpex;
	const grossMargin =
		totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
	const netMargin =
		totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

	return (
		<div className="space-y-4">
			{/* Top summary */}
			<div className="grid gap-3 lg:grid-cols-3">
				<MetricCard
					label="Total Pendapatan"
					value={formatRupiah(totalRevenue)}
					hint={`${revenueRows.length} akun`}
					tone="emerald"
				/>
				<MetricCard
					label="Total Beban + HPP"
					value={formatRupiah(totalHpp + totalOpex)}
					hint={`${hppRows.length + opexRows.length} akun`}
					tone="rose"
				/>
				<MetricCard
					label={netProfit >= 0 ? "Laba Bersih" : "Rugi Bersih"}
					value={formatRupiah(netProfit)}
					hint={`Margin ${netMargin.toFixed(1)}%`}
					tone={netProfit >= 0 ? "emerald" : "rose"}
				/>
			</div>

			{/* P&L table */}
			<div className="overflow-hidden rounded-lg border border-border-default bg-surface-2">
				<table className="w-full text-sm">
					<tbody className="divide-y divide-border-default/50">
						{/* Revenue */}
						<SectionRow label="PENDAPATAN" />
						{revenueRows.map((r) => (
							<AccountRow key={r.code} row={r} />
						))}
						<SubtotalRow
							label="Total Pendapatan"
							amount={totalRevenue}
							tone="emerald"
						/>

						{/* HPP */}
						{hppRows.length > 0 && (
							<>
								<SectionRow label="HPP (HARGA POKOK PENJUALAN)" />
								{hppRows.map((r) => (
									<AccountRow key={r.code} row={r} negative />
								))}
								<SubtotalRow
									label="Total HPP"
									amount={-totalHpp}
									tone="rose"
								/>
								<EmphasisRow
									label="Laba Kotor (Gross Profit)"
									amount={grossProfit}
									hint={`Margin ${grossMargin.toFixed(1)}%`}
								/>
							</>
						)}

						{/* OpEx */}
						{opexRows.length > 0 && (
							<>
								<SectionRow label="BEBAN OPERASIONAL" />
								{opexRows.map((r) => (
									<AccountRow key={r.code} row={r} negative />
								))}
								<SubtotalRow
									label="Total Beban Operasional"
									amount={-totalOpex}
									tone="rose"
								/>
							</>
						)}

						{/* Net Profit */}
						<EmphasisRow
							label={netProfit >= 0 ? "LABA BERSIH" : "RUGI BERSIH"}
							amount={netProfit}
							hint={`Net margin ${netMargin.toFixed(1)}%`}
							bold
						/>
					</tbody>
				</table>
			</div>
		</div>
	);
}

function MetricCard({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: string;
	hint: string;
	tone: "emerald" | "rose";
}) {
	const cls =
		tone === "emerald"
			? "border-emerald-500/30 bg-emerald-500/5"
			: "border-rose-500/30 bg-rose-500/5";
	const labelTone =
		tone === "emerald"
			? "text-emerald-700 dark:text-emerald-300"
			: "text-rose-700 dark:text-rose-300";
	return (
		<div className={`rounded-lg border p-3 ${cls}`}>
			<div
				className={`text-[10px] uppercase tracking-wider ${labelTone}`}
			>
				{label}
			</div>
			<div className="mt-1 tabular text-fluid-h2 font-semibold text-foreground">
				{value}
			</div>
			<div className="text-[11px] text-muted-foreground">{hint}</div>
		</div>
	);
}

function SectionRow({ label }: { label: string }) {
	return (
		<tr className="bg-surface-3/40">
			<td
				colSpan={3}
				className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
			>
				{label}
			</td>
		</tr>
	);
}

function AccountRow({
	row,
	negative,
}: {
	row: AccountAggregate;
	negative?: boolean;
}) {
	return (
		<tr className="hover:bg-muted/10">
			<td className="px-3 py-2 tabular text-fluid-caption font-medium text-foreground">
				<Link
					href={`/finance/accounting/ledger/${encodeURIComponent(row.code)}`}
					className="hover:text-primary hover:underline"
				>
					{row.code}
				</Link>
			</td>
			<td className="px-3 py-2 text-fluid-caption text-foreground">
				{row.name}
			</td>
			<td
				className={`px-3 py-2 text-right tabular text-fluid-caption font-medium ${
					negative
						? "text-rose-600 dark:text-rose-400"
						: "text-foreground"
				}`}
			>
				{negative ? "−" : ""}
				{formatRupiah(row.balance)}
			</td>
		</tr>
	);
}

function SubtotalRow({
	label,
	amount,
	tone,
}: {
	label: string;
	amount: number;
	tone: "emerald" | "rose";
}) {
	const cls =
		tone === "emerald"
			? "text-emerald-700 dark:text-emerald-300"
			: "text-rose-700 dark:text-rose-300";
	return (
		<tr className="bg-surface-3/20">
			<td
				colSpan={2}
				className="px-3 py-2 text-right text-fluid-caption font-semibold text-foreground"
			>
				{label}
			</td>
			<td
				className={`px-3 py-2 text-right tabular text-fluid-caption font-semibold ${cls}`}
			>
				{formatRupiah(amount)}
			</td>
		</tr>
	);
}

function EmphasisRow({
	label,
	amount,
	hint,
	bold,
}: {
	label: string;
	amount: number;
	hint?: string;
	bold?: boolean;
}) {
	return (
		<tr className="bg-primary/5">
			<td
				colSpan={2}
				className={`px-3 py-2.5 text-right text-foreground ${bold ? "text-fluid-body font-bold" : "text-fluid-caption font-semibold"}`}
			>
				{label}
				{hint && (
					<span className="ml-2 text-[10px] font-normal text-muted-foreground">
						({hint})
					</span>
				)}
			</td>
			<td
				className={`px-3 py-2.5 text-right tabular ${
					amount >= 0
						? "text-emerald-700 dark:text-emerald-300"
						: "text-rose-700 dark:text-rose-300"
				} ${bold ? "text-fluid-body font-bold" : "text-fluid-caption font-semibold"}`}
			>
				{formatRupiah(amount)}
			</td>
		</tr>
	);
}
