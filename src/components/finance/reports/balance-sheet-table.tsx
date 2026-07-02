"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDateID, formatRupiah } from "@/lib/format";
import type { AccountAggregate } from "./trial-balance-table";

export function BalanceSheetTable({
	rows,
	retainedEarnings,
	asOf,
}: {
	rows: AccountAggregate[];
	retainedEarnings: number;
	asOf: string;
}) {
	const assets = rows.filter((r) => r.account_type === "asset");
	const liabilities = rows.filter((r) => r.account_type === "liability");
	const equity = rows.filter((r) => r.account_type === "equity");

	const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
	const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
	const totalEquityExplicit = equity.reduce((s, r) => s + r.balance, 0);
	const totalEquity = totalEquityExplicit + retainedEarnings;
	const totalLiaEquity = totalLiabilities + totalEquity;
	const diff = totalAssets - totalLiaEquity;
	const isBalanced = Math.abs(diff) < 1;

	return (
		<div className="space-y-3">
			<div className="rounded-[16px] border border-border-subtle bg-card shadow-[var(--shadow-level-2)] px-5 py-3 text-fluid-caption">
				<span className="font-medium text-foreground">Snapshot per:</span>{" "}
				<span className="tabular">{formatDateID(asOf)}</span> · saldo akumulatif
				dari awal sampai tanggal ini.
			</div>

			{/* Top summary */}
			<div className="grid gap-3 lg:grid-cols-3">
				<SummaryCard
					label="Total Aset"
					value={formatRupiah(totalAssets)}
					hint={`${assets.length} akun`}
					tone="emerald"
				/>
				<SummaryCard
					label="Total Kewajiban + Ekuitas"
					value={formatRupiah(totalLiaEquity)}
					hint={`${liabilities.length} kewajiban · ${equity.length}+1 ekuitas`}
					tone="sky"
				/>
				<SummaryCard
					label="Balance Check"
					value={isBalanced ? "✓ Balanced" : `Selisih ${formatRupiah(diff)}`}
					hint="Aset harus = Kewajiban + Ekuitas"
					tone={isBalanced ? "emerald" : "rose"}
				/>
			</div>

			{/* Two-column layout: Assets | Liabilities + Equity */}
			<div className="grid gap-3 lg:grid-cols-2">
				{/* ASET */}
				<section className="overflow-hidden rounded-[16px] border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
					<header className="border-b border-border-default bg-emerald-500/10 px-5 py-2">
						<Badge
							variant="outline"
							className="border-emerald-500/30 bg-emerald-500/15 text-[11px] text-emerald-700 dark:text-emerald-300"
						>
							ASET
						</Badge>
					</header>
					<table className="w-full text-sm">
						<tbody className="divide-y divide-border-default/50">
							{assets.length === 0 ? (
								<tr>
									<td
										colSpan={2}
										className="px-5 py-3 text-center text-[11px] text-muted-foreground"
									>
										Belum ada movement.
									</td>
								</tr>
							) : (
								assets.map((r) => <AccountRow key={r.code} row={r} />)
							)}
							<tr className="bg-emerald-500/5">
								<td className="px-5 py-2.5 text-right text-fluid-caption font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
									Total Aset
								</td>
								<td className="px-5 py-2.5 text-right tabular text-fluid-body font-bold text-foreground">
									{formatRupiah(totalAssets)}
								</td>
							</tr>
						</tbody>
					</table>
				</section>

				{/* KEWAJIBAN + EKUITAS */}
				<section className="overflow-hidden rounded-[16px] border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
					<header className="border-b border-border-default bg-sky-500/10 px-5 py-2">
						<div className="flex items-center gap-2">
							<Badge
								variant="outline"
								className="border-amber-500/30 bg-amber-500/15 text-[11px] text-amber-700 dark:text-amber-300"
							>
								KEWAJIBAN
							</Badge>
							<span className="text-[11px] text-muted-foreground">+</span>
							<Badge
								variant="outline"
								className="border-sky-500/30 bg-sky-500/15 text-[11px] text-sky-700 dark:text-sky-300"
							>
								EKUITAS
							</Badge>
						</div>
					</header>
					<table className="w-full text-sm">
						<tbody className="divide-y divide-border-default/50">
							{liabilities.length > 0 && (
								<>
									<tr className="bg-amber-500/5">
										<td
											colSpan={2}
											className="px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300"
										>
											Kewajiban
										</td>
									</tr>
									{liabilities.map((r) => (
										<AccountRow key={r.code} row={r} />
									))}
									<tr className="bg-amber-500/10">
										<td className="px-5 py-2 text-right text-fluid-caption font-semibold text-amber-700 dark:text-amber-300">
											Subtotal Kewajiban
										</td>
										<td className="px-5 py-2 text-right tabular text-fluid-caption font-semibold text-foreground">
											{formatRupiah(totalLiabilities)}
										</td>
									</tr>
								</>
							)}
							{(equity.length > 0 || retainedEarnings !== 0) && (
								<>
									<tr className="bg-sky-500/5">
										<td
											colSpan={2}
											className="px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300"
										>
											Ekuitas
										</td>
									</tr>
									{equity.map((r) => (
										<AccountRow key={r.code} row={r} />
									))}
									{/* Retained earnings row */}
									<tr className="transition-colors hover:bg-secondary/40">
										<td className="px-5 py-2 text-fluid-caption text-foreground">
											<span className="italic">Laba Ditahan</span>{" "}
											<span className="text-[11px] text-muted-foreground">
												(revenue − expense)
											</span>
										</td>
										<td
											className={`px-5 py-2 text-right tabular text-fluid-caption font-medium ${
												retainedEarnings >= 0
													? "text-foreground"
													: "text-rose-600 dark:text-rose-400"
											}`}
										>
											{formatRupiah(retainedEarnings)}
										</td>
									</tr>
									<tr className="bg-sky-500/10">
										<td className="px-5 py-2 text-right text-fluid-caption font-semibold text-sky-700 dark:text-sky-300">
											Subtotal Ekuitas
										</td>
										<td className="px-5 py-2 text-right tabular text-fluid-caption font-semibold text-foreground">
											{formatRupiah(totalEquity)}
										</td>
									</tr>
								</>
							)}
							<tr className="bg-sky-500/5">
								<td className="px-5 py-2.5 text-right text-fluid-caption font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
									Total Kewajiban + Ekuitas
								</td>
								<td className="px-5 py-2.5 text-right tabular text-fluid-body font-bold text-foreground">
									{formatRupiah(totalLiaEquity)}
								</td>
							</tr>
						</tbody>
					</table>
				</section>
			</div>

			{!isBalanced && (
				<div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-fluid-caption">
					<div className="font-semibold text-rose-700 dark:text-rose-300">
						⚠ Neraca tidak seimbang
					</div>
					<div className="mt-1 text-muted-foreground">
						Selisih {formatRupiah(diff)} antara Total Aset (
						{formatRupiah(totalAssets)}) dan Total Kewajiban + Ekuitas (
						{formatRupiah(totalLiaEquity)}). Bisa karena ada manual entry yang
						ga balanced atau bug di settlement. Cek Trial Balance dulu.
					</div>
				</div>
			)}
		</div>
	);
}

function SummaryCard({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: string;
	hint: string;
	tone: "emerald" | "sky" | "rose";
}) {
	const cls =
		tone === "emerald"
			? "border-emerald-500/30 bg-emerald-500/5"
			: tone === "sky"
				? "border-sky-500/30 bg-sky-500/5"
				: "border-rose-500/30 bg-rose-500/5";
	const labelTone =
		tone === "emerald"
			? "text-emerald-700 dark:text-emerald-300"
			: tone === "sky"
				? "text-sky-700 dark:text-sky-300"
				: "text-rose-700 dark:text-rose-300";
	return (
		<div className={`rounded-[16px] border p-4 ${cls}`}>
			<div className={`text-[11px] uppercase tracking-wider ${labelTone}`}>
				{label}
			</div>
			<div className="mt-1 tabular text-fluid-h2 font-semibold text-foreground">
				{value}
			</div>
			<div className="text-[11px] text-muted-foreground">{hint}</div>
		</div>
	);
}

function AccountRow({ row }: { row: AccountAggregate }) {
	return (
		<tr className="transition-colors hover:bg-secondary/40">
			<td className="px-5 py-2 text-fluid-caption text-foreground">
				<Link
					href={`/finance/accounting/ledger/${encodeURIComponent(row.code)}`}
					className="hover:text-primary hover:underline"
				>
					<span className="tabular text-[11px] text-muted-foreground">
						{row.code}
					</span>{" "}
					{row.name}
				</Link>
			</td>
			<td
				className={`px-5 py-2 text-right tabular text-fluid-caption font-medium ${
					row.balance < 0
						? "text-rose-600 dark:text-rose-400"
						: "text-foreground"
				}`}
			>
				{formatRupiah(row.balance)}
			</td>
		</tr>
	);
}
