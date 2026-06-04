"use client";

import { Calendar, Check, ChevronDown, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import { ENTRY_TYPE_LABEL, SOURCE_LABEL } from "@/lib/finance/accounting";
import { formatDateID, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

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
				.map((s) => ({ value: s, label: SOURCE_LABEL[s] ?? s })),
		];
	}, [rows]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((r) => {
			if (sourceFilter !== "all" && r.source_type !== sourceFilter)
				return false;
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
				description="Settlement event, catat Pembelian, atau commit Stock Opname akan otomatis mem-posting entry ke sini."
			/>
		);
	}

	return (
		<div className="space-y-3">
			{/* Filters */}
			<div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
				<div className="relative flex-1 lg:max-w-sm">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Cari ref, deskripsi, akun…"
						aria-label="Cari jurnal"
						className="h-9 w-full rounded-md border border-border-default bg-card pl-9 pr-3 text-[13px] placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground/15"
					/>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="inline-flex items-center gap-2 rounded-md border border-border-default bg-card px-2.5 text-[12px]">
						<Calendar className="size-3.5 text-muted-foreground" aria-hidden />
						<input
							type="date"
							defaultValue={defaultFrom ?? ""}
							onChange={(e) => updateDate("from", e.target.value)}
							aria-label="Dari tanggal"
							className="h-9 bg-transparent text-[12px] focus:outline-none"
						/>
						<span className="text-muted-foreground/50">→</span>
						<input
							type="date"
							defaultValue={defaultTo ?? ""}
							onChange={(e) => updateDate("to", e.target.value)}
							aria-label="Sampai tanggal"
							className="h-9 bg-transparent text-[12px] focus:outline-none"
						/>
						{hasDateFilter && (
							<button
								type="button"
								onClick={clearDates}
								className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
							>
								Reset
							</button>
						)}
					</div>
					<div className="inline-flex items-center gap-0.5 rounded-md border border-border-default bg-secondary p-0.5">
						{(
							[
								{ key: "all", label: "Semua" },
								{ key: "posted", label: "Posted" },
								{ key: "reversed", label: "Dibalik" },
							] as const
						).map((o) => {
							const active = o.key === statusFilter;
							return (
								<button
									key={o.key}
									type="button"
									onClick={() => setStatusFilter(o.key)}
									aria-pressed={active}
									className={cn(
										"rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
										active
											? "bg-card text-foreground shadow-[var(--shadow-level-2)]"
											: "text-muted-foreground hover:text-foreground",
									)}
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
				<div className="rounded-lg border border-dashed border-border-default bg-secondary/40 p-8 text-center text-[13px] text-muted-foreground">
					Tidak ada jurnal yang cocok dengan filter ini.
				</div>
			) : (
				<ul className="overflow-hidden rounded-lg border border-border-default bg-card">
					{filtered.map((entry, i) => (
						<li
							key={entry.id}
							className={i > 0 ? "border-t border-border-subtle" : undefined}
						>
							<JournalEntry
								entry={entry}
								open={expanded === entry.id}
								onToggle={() =>
									setExpanded((cur) => (cur === entry.id ? null : entry.id))
								}
							/>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function JournalEntry({
	entry,
	open,
	onToggle,
}: {
	entry: JournalEntryRow;
	open: boolean;
	onToggle: () => void;
}) {
	const totalDebit = entry.lines.reduce((s, l) => s + l.debit_amount, 0);
	const totalCredit = entry.lines.reduce((s, l) => s + l.credit_amount, 0);
	const balanced = totalDebit === totalCredit;

	return (
		<div className={entry.is_reversed ? "opacity-70" : undefined}>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
			>
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="tabular text-[12px] font-semibold text-foreground">
							{entry.ref_id}
						</span>
						<Tag>{ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type}</Tag>
						<Tag>{SOURCE_LABEL[entry.source_type] ?? entry.source_type}</Tag>
						{entry.is_reversed && (
							<span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
								Dibalik
							</span>
						)}
					</div>
					<div className="truncate text-[13px] font-medium text-foreground">
						{entry.description}
					</div>
					<div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
						<span>{formatDateID(entry.entry_date)}</span>
						{entry.created_by_name && (
							<>
								<Dot />
								<span>oleh {entry.created_by_name}</span>
							</>
						)}
						<Dot />
						<span>{entry.lines.length} baris</span>
						{balanced && !entry.is_reversed && (
							<>
								<Dot />
								<span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
									<Check className="size-3" aria-hidden strokeWidth={2.5} />
									seimbang
								</span>
							</>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2.5">
					<span className="tabular text-[15px] font-semibold text-foreground">
						{formatRupiah(entry.total_amount)}
					</span>
					<ChevronDown
						className={cn(
							"size-4 text-muted-foreground transition-transform",
							open && "rotate-180",
						)}
						aria-hidden
					/>
				</div>
			</button>

			{open && (
				<div className="border-t border-border-subtle bg-secondary/30 px-4 pb-4 pt-3">
					<table className="w-full">
						<thead>
							<tr className="border-b border-border-subtle text-left">
								<th className="eyebrow pb-1.5 pr-3 font-normal">Akun</th>
								<th className="eyebrow pb-1.5 pr-3 font-normal">Keterangan</th>
								<th className="eyebrow pb-1.5 pl-3 text-right font-normal">
									Debit
								</th>
								<th className="eyebrow pb-1.5 pl-3 text-right font-normal">
									Kredit
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border-subtle">
							{entry.lines.map((line) => (
								<tr key={line.id}>
									<td className="py-2 pr-3 align-top">
										<div className="tabular text-[12px] font-medium text-foreground">
											{line.account_code}
										</div>
										<div className="text-[11px] text-muted-foreground">
											{line.account_name ?? "—"}
										</div>
									</td>
									<td className="py-2 pr-3 align-top text-[12px] text-muted-foreground">
										{line.description ?? "—"}
									</td>
									<td className="py-2 pl-3 text-right align-top tabular text-[12px]">
										{line.debit_amount > 0 ? (
											<span className="font-medium text-foreground">
												{formatRupiah(line.debit_amount)}
											</span>
										) : (
											<span className="text-muted-foreground/30">—</span>
										)}
									</td>
									<td className="py-2 pl-3 text-right align-top tabular text-[12px]">
										{line.credit_amount > 0 ? (
											<span className="font-medium text-foreground">
												{formatRupiah(line.credit_amount)}
											</span>
										) : (
											<span className="text-muted-foreground/30">—</span>
										)}
									</td>
								</tr>
							))}
						</tbody>
						<tfoot>
							<tr className="border-t border-border-default">
								<td className="pt-2 pr-3 text-right align-top" colSpan={2}>
									<span className="inline-flex items-center gap-1 text-[11px] font-medium">
										{balanced ? (
											<span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
												<Check
													className="size-3.5"
													aria-hidden
													strokeWidth={2.5}
												/>
												Debit = kredit
											</span>
										) : (
											<span className="text-destructive">Tidak seimbang</span>
										)}
									</span>
								</td>
								<td className="pt-2 pl-3 text-right align-top tabular text-[12px] font-semibold text-foreground">
									{formatRupiah(totalDebit)}
								</td>
								<td className="pt-2 pl-3 text-right align-top tabular text-[12px] font-semibold text-foreground">
									{formatRupiah(totalCredit)}
								</td>
							</tr>
						</tfoot>
					</table>
					{entry.is_reversed && entry.reversed_at && (
						<p className="mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-[11px] text-destructive">
							Entry ini sudah dibalik pada {formatDateID(entry.reversed_at)}.
						</p>
					)}
				</div>
			)}
		</div>
	);
}

function Tag({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
			{children}
		</span>
	);
}

function Dot() {
	return (
		<span aria-hidden className="text-muted-foreground/40">
			·
		</span>
	);
}
