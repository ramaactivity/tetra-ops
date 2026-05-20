"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatDateID, formatRupiah } from "@/lib/format";

export type LedgerRow = {
	line_id: string;
	entry_id: string;
	ref_id: string;
	entry_date: string;
	entry_type: string;
	source_type: string;
	source_id: string | null;
	is_reversed: boolean;
	entry_description: string;
	line_description: string | null;
	debit_amount: number;
	credit_amount: number;
	running_balance: number;
};

const SOURCE_LABEL: Record<string, string> = {
	settlement: "Settlement",
	settlement_reversal: "Settlement (reversal)",
	purchase: "Pembelian",
	payment: "Pembayaran",
	manual: "Manual",
	sinking_fund: "Sinking Fund",
	stock_take: "Stock Opname",
};

export function LedgerTable({
	rows,
	accountType,
}: {
	rows: LedgerRow[];
	accountType: string;
}) {
	const [query, setQuery] = useState("");

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter(
			(r) =>
				r.ref_id.toLowerCase().includes(q) ||
				r.entry_description.toLowerCase().includes(q) ||
				(r.line_description ?? "").toLowerCase().includes(q),
		);
	}, [rows, query]);

	return (
		<div className="space-y-3">
			<div className="relative max-w-md">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Cari ref, deskripsi entry/line..."
					className="h-9 w-full rounded-md border border-border-default bg-surface-2 pl-9 pr-3 text-fluid-caption placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
				/>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada entry yang cocok.
				</div>
			) : (
				<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
					{/* Desktop */}
					<div className="hidden md:block">
						<table className="w-full text-sm">
							<thead className="border-b border-border-default bg-surface-3/40 text-[10px] uppercase tracking-wider text-muted-foreground">
								<tr className="text-left">
									<th className="px-3 py-2.5">Tanggal</th>
									<th className="px-3 py-2.5">Ref / Sumber</th>
									<th className="px-3 py-2.5">Deskripsi</th>
									<th className="px-3 py-2.5 text-right">Debit</th>
									<th className="px-3 py-2.5 text-right">Credit</th>
									<th className="px-3 py-2.5 text-right">Saldo</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border-default/50">
								{filtered.map((r) => (
									<tr
										key={r.line_id}
										className={`hover:bg-muted/20 ${
											r.is_reversed ? "opacity-60" : ""
										}`}
									>
										<td className="px-3 py-2 align-top tabular text-fluid-caption font-medium text-foreground whitespace-nowrap">
											{formatDateID(r.entry_date)}
										</td>
										<td className="px-3 py-2 align-top">
											<div className="tabular text-[11px] font-medium text-foreground">
												{r.ref_id}
											</div>
											<div className="mt-0.5 flex flex-wrap items-center gap-1">
												<Badge
													variant="outline"
													className="h-4 px-1 text-[9px] text-muted-foreground"
												>
													{SOURCE_LABEL[r.source_type] ?? r.source_type}
												</Badge>
												{r.is_reversed && (
													<Badge
														variant="outline"
														className="h-4 border-rose-500/30 bg-rose-500/10 px-1 text-[9px] text-rose-700 dark:text-rose-300"
													>
														Reversed
													</Badge>
												)}
											</div>
										</td>
										<td className="px-3 py-2 align-top text-fluid-caption text-foreground">
											<div className="line-clamp-2">{r.entry_description}</div>
											{r.line_description &&
												r.line_description !== r.entry_description && (
													<div className="mt-0.5 line-clamp-2 text-[10px] italic text-muted-foreground">
														{r.line_description}
													</div>
												)}
										</td>
										<td className="px-3 py-2 align-top text-right tabular text-fluid-caption">
											{r.debit_amount > 0 ? (
												<span className="font-medium text-foreground">
													{formatRupiah(r.debit_amount)}
												</span>
											) : (
												<span className="text-muted-foreground/30">—</span>
											)}
										</td>
										<td className="px-3 py-2 align-top text-right tabular text-fluid-caption">
											{r.credit_amount > 0 ? (
												<span className="font-medium text-foreground">
													{formatRupiah(r.credit_amount)}
												</span>
											) : (
												<span className="text-muted-foreground/30">—</span>
											)}
										</td>
										<td className="px-3 py-2 align-top text-right tabular text-fluid-caption font-semibold text-foreground">
											{formatRupiah(r.running_balance)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* Mobile cards */}
					<div className="space-y-2 md:hidden">
						{filtered.map((r) => (
							<div
								key={r.line_id}
								className={`space-y-1.5 rounded-md border border-border-default/60 bg-surface-1 p-3 text-fluid-caption ${
									r.is_reversed ? "opacity-60" : ""
								}`}
							>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="tabular font-medium text-foreground">
											{formatDateID(r.entry_date)}
										</div>
										<div className="tabular text-[10px] text-muted-foreground">
											{r.ref_id}
										</div>
									</div>
									<div className="text-right">
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Saldo
										</div>
										<div className="tabular font-semibold text-foreground">
											{formatRupiah(r.running_balance)}
										</div>
									</div>
								</div>
								<div className="text-foreground">{r.entry_description}</div>
								<div className="grid grid-cols-2 gap-2 border-t border-border-default/60 pt-1.5">
									<div>
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Debit
										</div>
										<div className="tabular font-medium">
											{r.debit_amount > 0
												? formatRupiah(r.debit_amount)
												: "—"}
										</div>
									</div>
									<div>
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Credit
										</div>
										<div className="tabular font-medium">
											{r.credit_amount > 0
												? formatRupiah(r.credit_amount)
												: "—"}
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			<div className="rounded-md border border-border-default/60 bg-surface-2/40 p-2.5 text-[11px] text-muted-foreground">
				<strong className="text-foreground">Catatan saldo:</strong>{" "}
				{accountType === "asset" || accountType === "expense"
					? "Akun normal debit — saldo naik saat debit, turun saat credit."
					: "Akun normal credit — saldo naik saat credit, turun saat debit."}{" "}
				Running balance ditampilkan dengan sign mengikuti akun-nya (positif = arah normal).
			</div>
		</div>
	);
}
