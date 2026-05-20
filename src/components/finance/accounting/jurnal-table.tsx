"use client";

import { Calendar, ChevronDown, ChevronUp, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateID, formatRupiah } from "@/lib/format";

export type JournalLineRow = {
	id: string;
	account_code: string;
	account_name: string | null;
	debit_amount: number;
	credit_amount: number;
	description: string | null;
	line_order: number;
};

export type JournalEntryRow = {
	id: string;
	ref_id: string;
	entry_date: string;
	entry_type: string;
	description: string;
	source_type: string;
	source_id: string | null;
	total_amount: number;
	is_reversed: boolean;
	reversed_at: string | null;
	created_at: string;
	created_by_name: string | null;
	lines: JournalLineRow[];
};

const ENTRY_TYPE_TONE: Record<string, string> = {
	revenue:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	expense:
		"border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
	asset_in:
		"border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	asset_out:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	transfer:
		"border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	adjustment:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	reversal: "border-border-default bg-surface-3 text-muted-foreground",
};

const ENTRY_TYPE_LABEL: Record<string, string> = {
	revenue: "Pendapatan",
	expense: "Beban",
	asset_in: "Aset masuk",
	asset_out: "Aset keluar",
	transfer: "Transfer",
	adjustment: "Adjustment",
	reversal: "Reversal",
};

const SOURCE_LABEL: Record<string, string> = {
	settlement: "Settlement",
	settlement_reversal: "Settlement (reversal)",
	purchase: "Pembelian",
	manual: "Manual",
	sinking_fund: "Sinking Fund",
	stock_take: "Stock Opname",
	payment: "Payment",
};

type StatusFilter = "all" | "posted" | "reversed";

export function JurnalTable({
	rows,
	defaultFrom,
	defaultTo,
}: {
	rows: JournalEntryRow[];
	defaultFrom?: string;
	defaultTo?: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	const [query, setQuery] = useState("");
	const [sourceFilter, setSourceFilter] = useState<string>("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [expanded, setExpanded] = useState<string | null>(null);

	const sourceOptions = useMemo(() => {
		const set = new Set<string>();
		for (const r of rows) set.add(r.source_type);
		return [
			{ value: "all", label: "Semua sumber" },
			...Array.from(set)
				.sort()
				.map((s) => ({
					value: s,
					label: SOURCE_LABEL[s] ?? s,
				})),
		];
	}, [rows]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((r) => {
			if (sourceFilter !== "all" && r.source_type !== sourceFilter) return false;
			if (statusFilter === "posted" && r.is_reversed) return false;
			if (statusFilter === "reversed" && !r.is_reversed) return false;
			if (!q) return true;
			return (
				r.ref_id.toLowerCase().includes(q) ||
				r.description.toLowerCase().includes(q) ||
				r.lines.some(
					(l) =>
						l.account_code.toLowerCase().includes(q) ||
						(l.account_name ?? "").toLowerCase().includes(q),
				)
			);
		});
	}, [rows, query, sourceFilter, statusFilter]);

	function updateDate(field: "from" | "to", value: string) {
		const next = new URLSearchParams(params.toString());
		if (value) next.set(field, value);
		else next.delete(field);
		next.set("tab", "journal");
		router.push(`${pathname}?${next.toString()}`);
	}

	function clearDates() {
		const next = new URLSearchParams(params.toString());
		next.delete("from");
		next.delete("to");
		next.set("tab", "journal");
		router.push(`${pathname}?${next.toString()}`);
	}

	const hasDateFilter = !!(defaultFrom || defaultTo);

	if (rows.length === 0) {
		return (
			<EmptyState
				title="Belum ada jurnal"
				description="Settlement event, catat Pembelian, atau commit Stock Opname akan auto-post entry ke sini."
			/>
		);
	}

	return (
		<div className="space-y-3">
			{/* Date filter */}
			<div className="flex flex-wrap items-center gap-2 rounded-md border border-border-default bg-surface-2 p-2 text-fluid-caption">
				<Calendar className="size-3.5 text-muted-foreground" />
				<span className="text-muted-foreground">Periode:</span>
				<input
					type="date"
					defaultValue={defaultFrom ?? ""}
					onChange={(e) => updateDate("from", e.target.value)}
					className="h-8 rounded-md border border-border-default bg-surface-1 px-2 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
				/>
				<span className="text-muted-foreground">→</span>
				<input
					type="date"
					defaultValue={defaultTo ?? ""}
					onChange={(e) => updateDate("to", e.target.value)}
					className="h-8 rounded-md border border-border-default bg-surface-1 px-2 text-[12px] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
				/>
				{hasDateFilter && (
					<button
						type="button"
						onClick={clearDates}
						className="press-down inline-flex h-8 items-center rounded-md border border-border-default bg-surface-1 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
					>
						Reset
					</button>
				)}
			</div>

			{/* Toolbar */}
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative flex-1 sm:max-w-md">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Cari ref, deskripsi, akun..."
						className="h-9 w-full rounded-md border border-border-default bg-surface-2 pl-9 pr-3 text-fluid-caption placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="inline-flex items-center gap-1 rounded-md border border-border-default bg-surface-2 p-1 text-[11px]">
						{(
							[
								{ key: "all", label: "Semua" },
								{ key: "posted", label: "Posted" },
								{ key: "reversed", label: "Reversed" },
							] as const
						).map((o) => {
							const active = o.key === statusFilter;
							return (
								<button
									key={o.key}
									type="button"
									onClick={() => setStatusFilter(o.key)}
									aria-pressed={active}
									className={`inline-flex items-center rounded px-2 py-1 font-medium transition-colors ${
										active
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
									}`}
								>
									{o.label}
								</button>
							);
						})}
					</div>
					<div className="w-44">
						<Combobox
							id="source-filter"
							value={sourceFilter}
							onValueChange={(v) => setSourceFilter(v ?? "all")}
							options={sourceOptions}
							allowFreeText={false}
						/>
					</div>
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada jurnal yang cocok dengan filter ini.
				</div>
			) : (
				<div className="space-y-2">
					{filtered.map((entry) => {
						const open = expanded === entry.id;
						return (
							<article
								key={entry.id}
								className={`rounded-lg border bg-surface-2 ${
									entry.is_reversed
										? "border-border-default/60 opacity-80"
										: "border-border-default"
								}`}
							>
								<button
									type="button"
									onClick={() => setExpanded(open ? null : entry.id)}
									className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-surface-3/40"
								>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="tabular text-fluid-caption font-semibold text-foreground">
												{entry.ref_id}
											</span>
											<Badge
												variant="outline"
												className={`h-5 px-1.5 text-[10px] ${ENTRY_TYPE_TONE[entry.entry_type] ?? ""}`}
											>
												{ENTRY_TYPE_LABEL[entry.entry_type] ??
													entry.entry_type}
											</Badge>
											<Badge
												variant="outline"
												className="h-5 px-1.5 text-[10px] text-muted-foreground"
											>
												{SOURCE_LABEL[entry.source_type] ?? entry.source_type}
											</Badge>
											{entry.is_reversed && (
												<Badge
													variant="outline"
													className="h-5 border-rose-500/30 bg-rose-500/10 px-1.5 text-[10px] text-rose-700 dark:text-rose-300"
												>
													Reversed
												</Badge>
											)}
										</div>
										<div className="text-fluid-caption font-medium text-foreground">
											{entry.description}
										</div>
										<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
											<span>{formatDateID(entry.entry_date)}</span>
											{entry.created_by_name && (
												<>
													<span className="text-muted-foreground/40">·</span>
													<span>by {entry.created_by_name}</span>
												</>
											)}
											<span className="text-muted-foreground/40">·</span>
											<span>{entry.lines.length} lines</span>
										</div>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										<span className="tabular text-fluid-body font-semibold text-foreground">
											{formatRupiah(entry.total_amount)}
										</span>
										{open ? (
											<ChevronUp className="size-4 text-muted-foreground" />
										) : (
											<ChevronDown className="size-4 text-muted-foreground" />
										)}
									</div>
								</button>

								{open && (
									<div className="border-t border-border-default px-3 pb-3 pt-2">
										<div className="overflow-hidden rounded-md border border-border-default">
											<table className="w-full text-sm">
												<thead className="bg-surface-3/40 text-[10px] uppercase tracking-wider text-muted-foreground">
													<tr>
														<th className="px-3 py-2 text-left">Akun</th>
														<th className="px-3 py-2 text-left">Deskripsi</th>
														<th className="px-3 py-2 text-right">Debit</th>
														<th className="px-3 py-2 text-right">Credit</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-border-default/50">
													{entry.lines.map((line) => (
														<tr key={line.id} className="hover:bg-muted/10">
															<td className="px-3 py-2 align-top">
																<div className="space-y-0.5">
																	<div className="tabular text-fluid-caption font-medium text-foreground">
																		{line.account_code}
																	</div>
																	<div className="text-[10px] text-muted-foreground">
																		{line.account_name ?? "—"}
																	</div>
																</div>
															</td>
															<td className="px-3 py-2 align-top text-fluid-caption text-muted-foreground">
																{line.description ?? "—"}
															</td>
															<td className="px-3 py-2 text-right align-top tabular text-fluid-caption">
																{line.debit_amount > 0 ? (
																	<span className="font-medium text-foreground">
																		{formatRupiah(line.debit_amount)}
																	</span>
																) : (
																	<span className="text-muted-foreground/40">
																		—
																	</span>
																)}
															</td>
															<td className="px-3 py-2 text-right align-top tabular text-fluid-caption">
																{line.credit_amount > 0 ? (
																	<span className="font-medium text-foreground">
																		{formatRupiah(line.credit_amount)}
																	</span>
																) : (
																	<span className="text-muted-foreground/40">
																		—
																	</span>
																)}
															</td>
														</tr>
													))}
													<tr className="bg-surface-3/20 font-medium">
														<td
															className="px-3 py-2 text-right text-[11px] uppercase tracking-wider text-muted-foreground"
															colSpan={2}
														>
															Total
														</td>
														<td className="px-3 py-2 text-right tabular text-fluid-caption font-semibold text-foreground">
															{formatRupiah(
																entry.lines.reduce(
																	(s, l) => s + l.debit_amount,
																	0,
																),
															)}
														</td>
														<td className="px-3 py-2 text-right tabular text-fluid-caption font-semibold text-foreground">
															{formatRupiah(
																entry.lines.reduce(
																	(s, l) => s + l.credit_amount,
																	0,
																),
															)}
														</td>
													</tr>
												</tbody>
											</table>
										</div>
										{entry.is_reversed && entry.reversed_at && (
											<div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-[11px] text-rose-700 dark:text-rose-300">
												Entry ini sudah di-reverse pada{" "}
												{formatDateID(entry.reversed_at)}.
											</div>
										)}
									</div>
								)}
							</article>
						);
					})}
				</div>
			)}
		</div>
	);
}
