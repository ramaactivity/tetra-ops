"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRupiah } from "@/lib/format";

export type CoaMeta = {
	code: string;
	name: string;
	account_type: string;
};

export type AccountAggregate = {
	code: string;
	name: string;
	account_type: string;
	debit: number;
	credit: number;
	balance: number;
};

const TYPE_LABEL: Record<string, string> = {
	asset: "Aset",
	liability: "Kewajiban",
	equity: "Ekuitas",
	revenue: "Pendapatan",
	expense: "Beban",
};

const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"];

const TYPE_TONE: Record<string, string> = {
	asset:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	liability:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	equity: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	revenue:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	expense: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function TrialBalanceTable({
	rows,
	from,
	to,
}: {
	rows: AccountAggregate[];
	from?: string;
	to?: string;
}) {
	const grouped = new Map<string, AccountAggregate[]>();
	for (const r of rows) {
		const arr = grouped.get(r.account_type) ?? [];
		arr.push(r);
		grouped.set(r.account_type, arr);
	}

	const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
	const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
	const isBalanced = totalDebit === totalCredit;
	const diff = totalDebit - totalCredit;

	if (rows.length === 0) {
		return (
			<EmptyState
				title="Tidak ada movement"
				description={
					from || to
						? "Tidak ada journal entry di periode ini."
						: "Belum ada journal entry. Settle event atau catat Pembelian dulu."
				}
			/>
		);
	}

	return (
		<div className="space-y-4">
			{/* Summary */}
			<div className="grid gap-3 rounded-lg border border-border-default bg-surface-2 p-4 text-fluid-caption lg:grid-cols-3">
				<div>
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Total Debit
					</div>
					<div className="tabular text-fluid-h3 font-semibold text-foreground">
						{formatRupiah(totalDebit)}
					</div>
				</div>
				<div>
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Total Credit
					</div>
					<div className="tabular text-fluid-h3 font-semibold text-foreground">
						{formatRupiah(totalCredit)}
					</div>
				</div>
				<div className="lg:text-right">
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Status Balanced
					</div>
					<div
						className={`tabular text-fluid-h3 font-semibold ${
							isBalanced
								? "text-emerald-700 dark:text-emerald-300"
								: "text-rose-700 dark:text-rose-300"
						}`}
					>
						{isBalanced ? "✓ Balanced" : `Selisih ${formatRupiah(diff)}`}
					</div>
					<div className="mt-0.5 text-[10px] text-muted-foreground">
						Total debit harus = total credit
					</div>
				</div>
			</div>

			{/* Grouped tables */}
			{TYPE_ORDER.filter((t) => grouped.has(t)).map((type) => {
				const items = grouped.get(type)!;
				const groupDebit = items.reduce((s, r) => s + r.debit, 0);
				const groupCredit = items.reduce((s, r) => s + r.credit, 0);
				const groupBalance = items.reduce((s, r) => s + r.balance, 0);
				return (
					<section
						key={type}
						className="overflow-hidden rounded-lg border border-border-default bg-surface-2"
					>
						<header className="flex items-center justify-between border-b border-border-default bg-surface-3/40 px-3 py-2">
							<div className="flex items-center gap-2">
								<Badge
									variant="outline"
									className={`h-5 px-1.5 text-[10px] ${TYPE_TONE[type] ?? ""}`}
								>
									{TYPE_LABEL[type] ?? type}
								</Badge>
								<span className="text-[11px] text-muted-foreground">
									{items.length} akun
								</span>
							</div>
							<span className="tabular text-fluid-caption font-semibold text-foreground">
								Saldo: {formatRupiah(groupBalance)}
							</span>
						</header>
						<div className="w-full overflow-x-auto">
							<table className="w-full text-sm">
								<thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
									<tr className="border-b border-border-default/60">
										<th className="px-3 py-2 text-left">Kode</th>
										<th className="px-3 py-2 text-left">Nama Akun</th>
										<th className="px-3 py-2 text-right">Debit</th>
										<th className="px-3 py-2 text-right">Credit</th>
										<th className="px-3 py-2 text-right">Saldo</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border-default/50">
									{items.map((r) => (
										<tr key={r.code} className="hover:bg-muted/10">
											<td className="px-3 py-2 tabular font-medium text-foreground">
												<Link
													href={`/finance/accounting/ledger/${encodeURIComponent(r.code)}`}
													className="hover:text-primary hover:underline"
													title="Buka buku besar"
												>
													{r.code}
												</Link>
											</td>
											<td className="px-3 py-2 text-fluid-caption text-foreground">
												{r.name}
											</td>
											<td className="px-3 py-2 text-right tabular text-fluid-caption">
												{r.debit > 0 ? (
													<span className="font-medium text-foreground">
														{formatRupiah(r.debit)}
													</span>
												) : (
													<span className="text-muted-foreground/30">—</span>
												)}
											</td>
											<td className="px-3 py-2 text-right tabular text-fluid-caption">
												{r.credit > 0 ? (
													<span className="font-medium text-foreground">
														{formatRupiah(r.credit)}
													</span>
												) : (
													<span className="text-muted-foreground/30">—</span>
												)}
											</td>
											<td className="px-3 py-2 text-right tabular text-fluid-caption font-semibold text-foreground">
												{formatRupiah(r.balance)}
											</td>
										</tr>
									))}
									<tr className="bg-surface-3/20 font-medium">
										<td
											className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground"
											colSpan={2}
										>
											Subtotal {TYPE_LABEL[type] ?? type}
										</td>
										<td className="px-3 py-2 text-right tabular text-fluid-caption font-semibold text-foreground">
											{formatRupiah(groupDebit)}
										</td>
										<td className="px-3 py-2 text-right tabular text-fluid-caption font-semibold text-foreground">
											{formatRupiah(groupCredit)}
										</td>
										<td className="px-3 py-2 text-right tabular text-fluid-caption font-semibold text-foreground">
											{formatRupiah(groupBalance)}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</section>
				);
			})}
		</div>
	);
}
