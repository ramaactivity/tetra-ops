"use client";

import { useMemo, useState } from "react";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { normalSide, SOURCE_LABEL } from "@/lib/finance/accounting";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

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

	const side = normalSide(accountType);

	return (
		<div className="space-y-3">
			<FilterSearchInput
				className="max-w-sm"
				value={query}
				onValueChange={setQuery}
				placeholder="Cari ref atau keterangan…"
				aria-label="Cari di buku besar"
			/>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-secondary/40 p-8 text-center text-[13px] text-muted-foreground">
					Tidak ada entry yang cocok.
				</div>
			) : (
				<div className="overflow-hidden rounded-lg border border-border-default bg-card">
					{/* Desktop */}
					<div className="hidden md:block">
						<table className="w-full">
							<thead>
								<tr className="border-b border-border-default bg-secondary/50 text-left">
									<th className="eyebrow px-4 py-2.5 font-normal">Tanggal</th>
									<th className="eyebrow px-4 py-2.5 font-normal">
										Ref / Sumber
									</th>
									<th className="eyebrow px-4 py-2.5 font-normal">
										Keterangan
									</th>
									<th className="eyebrow px-4 py-2.5 text-right font-normal">
										Debit
									</th>
									<th className="eyebrow px-4 py-2.5 text-right font-normal">
										Kredit
									</th>
									<th className="eyebrow px-4 py-2.5 text-right font-normal">
										Saldo
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border-subtle">
								{filtered.map((r) => (
									<tr
										key={r.line_id}
										className={cn(
											"transition-colors hover:bg-secondary/40",
											r.is_reversed && "opacity-60",
										)}
									>
										<td className="whitespace-nowrap px-4 py-2.5 align-top tabular text-[12px] font-medium text-foreground">
											{formatDateID(r.entry_date)}
										</td>
										<td className="px-4 py-2.5 align-top">
											<div className="tabular text-[11px] font-medium text-foreground">
												{r.ref_id}
											</div>
											<div className="mt-0.5 flex flex-wrap items-center gap-1.5">
												<span className="text-[10px] text-muted-foreground">
													{SOURCE_LABEL[r.source_type] ?? r.source_type}
												</span>
												{r.is_reversed && (
													<span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-medium text-destructive">
														dibalik
													</span>
												)}
											</div>
										</td>
										<td className="px-4 py-2.5 align-top text-[12px] text-foreground">
											<div className="line-clamp-2">{r.entry_description}</div>
											{r.line_description &&
												r.line_description !== r.entry_description && (
													<div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
														{r.line_description}
													</div>
												)}
										</td>
										<td className="px-4 py-2.5 text-right align-top tabular text-[12px]">
											{r.debit_amount > 0 ? (
												<span className="font-medium text-foreground">
													{formatRupiah(r.debit_amount)}
												</span>
											) : (
												<span className="text-muted-foreground/30">—</span>
											)}
										</td>
										<td className="px-4 py-2.5 text-right align-top tabular text-[12px]">
											{r.credit_amount > 0 ? (
												<span className="font-medium text-foreground">
													{formatRupiah(r.credit_amount)}
												</span>
											) : (
												<span className="text-muted-foreground/30">—</span>
											)}
										</td>
										<td
											className={cn(
												"px-4 py-2.5 text-right align-top tabular text-[12px] font-semibold",
												r.running_balance < 0
													? "text-destructive"
													: "text-foreground",
											)}
										>
											{formatRupiah(r.running_balance)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* Mobile cards */}
					<ul className="divide-y divide-border-subtle md:hidden">
						{filtered.map((r) => (
							<li
								key={r.line_id}
								className={cn(
									"space-y-1.5 px-4 py-3 text-[12px]",
									r.is_reversed && "opacity-60",
								)}
							>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="tabular font-medium text-foreground">
											{formatDateID(r.entry_date)}
										</div>
										<div className="tabular text-[10px] text-muted-foreground">
											{r.ref_id} ·{" "}
											{SOURCE_LABEL[r.source_type] ?? r.source_type}
										</div>
									</div>
									<div className="text-right">
										<div className="eyebrow text-[10px]">Saldo</div>
										<div
											className={cn(
												"tabular font-semibold",
												r.running_balance < 0
													? "text-destructive"
													: "text-foreground",
											)}
										>
											{formatRupiah(r.running_balance)}
										</div>
									</div>
								</div>
								<div className="text-foreground">{r.entry_description}</div>
								<div className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-1.5">
									<div>
										<div className="eyebrow text-[10px]">Debit</div>
										<div className="tabular font-medium">
											{r.debit_amount > 0 ? formatRupiah(r.debit_amount) : "—"}
										</div>
									</div>
									<div>
										<div className="eyebrow text-[10px]">Kredit</div>
										<div className="tabular font-medium">
											{r.credit_amount > 0
												? formatRupiah(r.credit_amount)
												: "—"}
										</div>
									</div>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}

			<p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
				Akun normal {side} — saldo{" "}
				{side === "debit" ? "naik saat debit" : "naik saat kredit"}, turun di
				sisi sebaliknya. Saldo positif berarti searah dengan posisi normal akun.
			</p>
		</div>
	);
}
