"use client";

import { ArrowRight, Download } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import type { CashBookRow } from "@/lib/finance/cash-book";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CashBookTableRow = CashBookRow & {
	title: string;
	sourceLabel: string;
	isReversed: boolean;
	projectId: string | null;
	eventName: string | null;
	contra: Array<{ code: string; name: string }>;
};

type Filter = "all" | "in" | "out";
const FILTERS: Array<[Filter, string]> = [
	["all", "Semua"],
	["in", "Uang masuk"],
	["out", "Uang keluar"],
];

/** "Kam, 1 Okt" — tanggal jurnal (YYYY-MM-DD) tanpa geser zona waktu. */
function shortDay(iso: string): string {
	return new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
}

function ddmmyyyy(iso: string): string {
	const [y, m, d] = iso.split("-");
	return `${d}/${m}/${y}`;
}

const POS = "text-emerald-700 dark:text-emerald-400";
const NEG = "text-rose-600 dark:text-rose-400";

export function CashBookTable({
	rows,
	opening,
	openingDate,
	closing,
	totalMasuk,
	totalKeluar,
	fileName,
	scopeLabel,
}: {
	rows: CashBookTableRow[];
	opening: number;
	openingDate: string;
	closing: number;
	totalMasuk: number;
	totalKeluar: number;
	fileName: string;
	scopeLabel: string;
}) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("all");

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((r) => {
			if (filter === "in" && r.masuk === 0) return false;
			if (filter === "out" && r.keluar === 0) return false;
			if (!q) return true;
			return [r.title, r.refId, r.sourceLabel, r.eventName ?? ""]
				.concat(r.contra.flatMap((c) => [c.code, c.name]))
				.some((s) => s.toLowerCase().includes(q));
		});
	}, [rows, query, filter]);

	// Format kolom sama dengan template Excel buku kas: Tanggal, Ref, No.Akun,
	// Uraian, Penerimaan (D), Pengeluaran (K), Saldo, Keterangan.
	function exportCsv() {
		const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
		const lines = [
			[
				"Tanggal",
				"Ref",
				"No.Akun",
				"Uraian",
				"Penerimaan (D)",
				"Pengeluaran (K)",
				"Saldo",
				"Keterangan",
			],
			[ddmmyyyy(openingDate), "", "", "Saldo Awal", "", "", opening, ""],
			...rows.map((r) => [
				ddmmyyyy(r.date),
				r.refId,
				r.contra.map((c) => c.code).join(", "),
				r.title,
				r.masuk || "",
				r.keluar || "",
				r.saldo,
				r.sourceLabel,
			]),
			["", "", "", "Total", totalMasuk, totalKeluar, closing, "Saldo akhir"],
		];
		// `;` + BOM: langsung terbaca rapi per kolom di Excel locale Indonesia.
		const csv = `﻿${lines.map((l) => l.map(cell).join(";")).join("\r\n")}`;
		const url = URL.createObjectURL(
			new Blob([csv], { type: "text/csv;charset=utf-8" }),
		);
		const a = document.createElement("a");
		a.href = url;
		a.download = fileName;
		a.click();
		URL.revokeObjectURL(url);
	}

	const filtered = visible.length !== rows.length;

	return (
		<section className="overflow-hidden rounded-[16px] border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3">
				<FilterSearchInput
					className="w-full sm:w-64"
					value={query}
					onValueChange={setQuery}
					placeholder="Cari uraian, ref, akun, event…"
				/>
				<fieldset
					aria-label="Jenis transaksi"
					className="inline-flex h-8 items-center rounded-full bg-secondary p-0.5"
				>
					{FILTERS.map(([key, label]) => (
						<button
							key={key}
							type="button"
							aria-pressed={filter === key}
							onClick={() => setFilter(key)}
							className={cn(
								"h-7 rounded-full px-3 text-[13px] font-medium transition-colors",
								filter === key
									? "bg-primary text-primary-foreground"
									: "text-foreground/60 hover:text-foreground",
							)}
						>
							{label}
						</button>
					))}
				</fieldset>
				<span className="text-[12px] text-muted-foreground">
					{visible.length} dari {rows.length} transaksi
				</span>
				<Button
					variant="outline"
					size="sm"
					className="ml-auto"
					onClick={exportCsv}
					disabled={rows.length === 0}
				>
					<Download aria-hidden />
					Export Excel
				</Button>
			</div>

			{/* Desktop: tabel buku kas */}
			<div className="hidden overflow-x-auto md:block">
				<table className="w-full min-w-[860px] text-[13px]">
					<thead>
						<tr className="border-b border-border-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
							<th className="px-4 py-2.5">Tanggal</th>
							<th className="px-4 py-2.5">Ref</th>
							<th className="px-4 py-2.5">Uraian</th>
							<th className="px-4 py-2.5 text-right">Masuk</th>
							<th className="px-4 py-2.5 text-right">Keluar</th>
							<th className="px-4 py-2.5 text-right">Saldo</th>
							<th className="px-4 py-2.5">Keterangan</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border-subtle">
						<tr className="bg-secondary/40">
							<td className="px-4 py-2.5 text-muted-foreground">
								{shortDay(openingDate)}
							</td>
							<td />
							<td className="px-4 py-2.5 font-medium italic">Saldo awal</td>
							<td />
							<td />
							<td
								className={cn(
									"tabular px-4 py-2.5 text-right font-semibold",
									opening < 0 && NEG,
								)}
							>
								{formatRupiah(opening)}
							</td>
							<td />
						</tr>
						{visible.map((r) => (
							<tr
								key={r.entryId}
								className={cn(
									"align-top transition-colors hover:bg-secondary/40",
									r.isReversed && "opacity-60",
								)}
							>
								<td className="whitespace-nowrap px-4 py-2.5">
									{shortDay(r.date)}
								</td>
								<td className="whitespace-nowrap px-4 py-2.5">
									<Link
										href={`/finance/accounting?entry=${encodeURIComponent(r.refId)}`}
										className="tabular text-[12px] text-muted-foreground hover:text-foreground hover:underline"
									>
										{r.refId}
									</Link>
								</td>
								<td className="px-4 py-2.5">
									<div className="line-clamp-2 text-foreground">{r.title}</div>
									<ContraLine row={r} />
								</td>
								<td className={cn("tabular px-4 py-2.5 text-right", POS)}>
									{r.masuk > 0 ? `+ ${formatRupiah(r.masuk)}` : ""}
								</td>
								<td className={cn("tabular px-4 py-2.5 text-right", NEG)}>
									{r.keluar > 0 ? `− ${formatRupiah(r.keluar)}` : ""}
								</td>
								<td
									className={cn(
										"tabular whitespace-nowrap px-4 py-2.5 text-right font-semibold",
										r.saldo < 0 && NEG,
									)}
								>
									{formatRupiah(r.saldo)}
								</td>
								<td className="px-4 py-2.5">
									<SourcePill row={r} />
								</td>
							</tr>
						))}
						{visible.length === 0 && (
							<tr>
								<td
									colSpan={7}
									className="px-4 py-8 text-center text-muted-foreground"
								>
									{rows.length === 0
										? "Belum ada transaksi di periode ini."
										: "Tidak ada transaksi yang cocok."}
								</td>
							</tr>
						)}
					</tbody>
					<tfoot>
						<tr className="border-t-2 border-border-default font-semibold">
							<td colSpan={3} className="px-4 py-3">
								Total periode ini
							</td>
							<td className={cn("tabular px-4 py-3 text-right", POS)}>
								+ {formatRupiah(totalMasuk)}
							</td>
							<td className={cn("tabular px-4 py-3 text-right", NEG)}>
								− {formatRupiah(totalKeluar)}
							</td>
							<td
								className={cn(
									"tabular px-4 py-3 text-right",
									closing < 0 && NEG,
								)}
							>
								{formatRupiah(closing)}
							</td>
							<td className="px-4 py-3 text-[12px] font-normal text-muted-foreground">
								saldo akhir
							</td>
						</tr>
					</tfoot>
				</table>
			</div>

			{/* Mobile: kartu per transaksi, saldo sebelum → sesudah */}
			<ul className="divide-y divide-border-subtle md:hidden">
				<li className="flex items-center justify-between bg-secondary/40 px-4 py-2.5 text-[13px]">
					<span className="font-medium italic">
						Saldo awal · {shortDay(openingDate)}
					</span>
					<span className={cn("tabular font-semibold", opening < 0 && NEG)}>
						{formatRupiah(opening)}
					</span>
				</li>
				{visible.map((r) => (
					<li
						key={r.entryId}
						className={cn(
							"space-y-1.5 px-4 py-3",
							r.isReversed && "opacity-60",
						)}
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="text-[13.5px] text-foreground">{r.title}</p>
								<p className="mt-0.5 text-[11.5px] text-muted-foreground">
									{shortDay(r.date)} · {r.sourceLabel}
								</p>
							</div>
							<span
								className={cn(
									"tabular shrink-0 text-[14px] font-semibold",
									r.masuk > 0
										? POS
										: r.keluar > 0
											? NEG
											: "text-muted-foreground",
								)}
							>
								{r.masuk > 0
									? `+ ${formatRupiah(r.masuk)}`
									: r.keluar > 0
										? `− ${formatRupiah(r.keluar)}`
										: "—"}
							</span>
						</div>
						<ContraLine row={r} />
						<div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
							Saldo
							<span className="tabular">{formatRupiah(r.saldoSebelum)}</span>
							<ArrowRight className="size-3" aria-hidden />
							<span
								className={cn(
									"tabular font-semibold text-foreground",
									r.saldo < 0 && NEG,
								)}
							>
								{formatRupiah(r.saldo)}
							</span>
						</div>
					</li>
				))}
				{visible.length === 0 && (
					<li className="px-4 py-8 text-center text-[13px] text-muted-foreground">
						{rows.length === 0
							? "Belum ada transaksi di periode ini."
							: "Tidak ada transaksi yang cocok."}
					</li>
				)}
				<li className="space-y-1 border-t-2 border-border-default px-4 py-3 text-[13px]">
					<div className="flex justify-between">
						<span className="text-muted-foreground">Total masuk</span>
						<span className={cn("tabular font-medium", POS)}>
							+ {formatRupiah(totalMasuk)}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Total keluar</span>
						<span className={cn("tabular font-medium", NEG)}>
							− {formatRupiah(totalKeluar)}
						</span>
					</div>
					<div className="flex justify-between font-semibold">
						<span>Saldo akhir</span>
						<span className={cn("tabular", closing < 0 && NEG)}>
							{formatRupiah(closing)}
						</span>
					</div>
				</li>
			</ul>

			<p className="border-t border-border-subtle px-4 py-2.5 text-[11.5px] text-muted-foreground">
				{scopeLabel}
				{filtered &&
					" · Saldo tiap baris tetap dihitung dari semua transaksi, bukan hanya yang tersaring."}
			</p>
		</section>
	);
}

function ContraLine({ row }: { row: CashBookTableRow }) {
	if (row.contra.length === 0 && !row.eventName) return null;
	return (
		<p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">
			{row.contra.length > 0 && (
				<>
					{row.masuk > 0 ? "dari " : row.keluar > 0 ? "untuk " : "↔ "}
					{row.contra.map((c) => c.name).join(", ")}
				</>
			)}
			{row.eventName && row.projectId && (
				<>
					{row.contra.length > 0 && " · "}
					<Link
						href={`/operations/${row.projectId}`}
						className="hover:text-foreground hover:underline"
					>
						{row.eventName}
					</Link>
				</>
			)}
		</p>
	);
}

function SourcePill({ row }: { row: CashBookTableRow }) {
	return (
		<div className="flex flex-wrap gap-1">
			{row.sourceLabel && (
				<span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[11.5px] text-foreground/80">
					{row.sourceLabel}
				</span>
			)}
			{row.isReversed && (
				<span className="inline-flex rounded-full bg-rose-500/10 px-2 py-0.5 text-[11.5px] font-medium text-destructive">
					dibatalkan
				</span>
			)}
		</div>
	);
}
