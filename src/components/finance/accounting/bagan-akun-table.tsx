"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";

export type CoaRow = {
	code: string;
	name: string;
	account_type: string;
	parent_code: string | null;
	description: string | null;
	is_active: boolean;
};

type Filter =
	| "all"
	| "asset"
	| "liability"
	| "equity"
	| "revenue"
	| "expense";

const TYPE_LABEL: Record<string, string> = {
	asset: "Aset",
	liability: "Kewajiban",
	equity: "Ekuitas",
	revenue: "Pendapatan",
	expense: "Beban",
};

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

const NORMAL_BY_TYPE: Record<string, "debit" | "credit"> = {
	asset: "debit",
	liability: "credit",
	equity: "credit",
	revenue: "credit",
	expense: "debit",
};

export function BaganAkunTable({ rows }: { rows: CoaRow[] }) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("all");
	const [showInactive, setShowInactive] = useState(false);

	// Skip header/parent rows (account_type = empty or === 'ASSETS' etc)
	const accountRows = useMemo(
		() => rows.filter((r) => r.parent_code !== null || r.code.includes("-")),
		[rows],
	);

	const counts = useMemo(() => {
		const out = {
			all: accountRows.length,
			asset: 0,
			liability: 0,
			equity: 0,
			revenue: 0,
			expense: 0,
		};
		for (const r of accountRows) {
			if (!r.is_active && !showInactive) continue;
			const t = r.account_type as keyof typeof out;
			if (t in out && t !== "all") (out[t] as number)++;
		}
		return out;
	}, [accountRows, showInactive]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return accountRows.filter((r) => {
			if (!showInactive && !r.is_active) return false;
			if (filter !== "all" && r.account_type !== filter) return false;
			if (!q) return true;
			return (
				r.code.toLowerCase().includes(q) ||
				r.name.toLowerCase().includes(q) ||
				(r.description ?? "").toLowerCase().includes(q)
			);
		});
	}, [accountRows, query, filter, showInactive]);

	if (accountRows.length === 0) {
		return (
			<EmptyState
				title="Bagan Akun belum di-seed"
				description="Run migration chart_of_accounts seed dulu — biasanya sudah ada di production."
			/>
		);
	}

	const columns: ResponsiveTableColumn<CoaRow>[] = [
		{
			key: "code",
			header: "Kode",
			render: (r) => (
				<span className="tabular font-medium text-foreground">{r.code}</span>
			),
		},
		{
			key: "name",
			header: "Nama Akun",
			render: (r) => (
				<div className="space-y-0.5">
					<div className="font-medium text-foreground">{r.name}</div>
					{r.description && (
						<div className="line-clamp-2 text-[11px] text-muted-foreground">
							{r.description}
						</div>
					)}
				</div>
			),
		},
		{
			key: "type",
			header: "Tipe",
			render: (r) => (
				<Badge
					variant="outline"
					className={`h-5 px-1.5 text-[10px] ${TYPE_TONE[r.account_type] ?? ""}`}
				>
					{TYPE_LABEL[r.account_type] ?? r.account_type}
				</Badge>
			),
		},
		{
			key: "normal",
			header: "Normal",
			hideOnMobile: true,
			render: (r) => {
				const normal = NORMAL_BY_TYPE[r.account_type] ?? "debit";
				return (
					<Badge
						variant="outline"
						className={`h-5 px-1.5 text-[10px] uppercase ${
							normal === "debit"
								? "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300"
								: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
						}`}
					>
						{normal}
					</Badge>
				);
			},
		},
		{
			key: "status",
			header: "Status",
			hideOnMobile: true,
			render: (r) =>
				r.is_active ? (
					<Badge
						variant="outline"
						className="h-5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300"
					>
						Aktif
					</Badge>
				) : (
					<Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
						Nonaktif
					</Badge>
				),
		},
		{
			key: "ledger",
			header: "Buku Besar",
			align: "right",
			render: (r) => (
				<Link
					href={`/finance/accounting/ledger/${encodeURIComponent(r.code)}`}
					className="press-down inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2 text-[11px] font-medium text-muted-foreground hover:bg-surface-3 hover:text-foreground"
					title={`Buka buku besar ${r.code}`}
				>
					Buku Besar
					<ArrowRight className="size-3" />
				</Link>
			),
		},
	];

	const filterOptions: ReadonlyArray<{ key: Filter; label: string; count: number }> =
		[
			{ key: "all", label: "Semua", count: counts.all },
			{ key: "asset", label: "Aset", count: counts.asset },
			{ key: "liability", label: "Kewajiban", count: counts.liability },
			{ key: "equity", label: "Ekuitas", count: counts.equity },
			{ key: "revenue", label: "Pendapatan", count: counts.revenue },
			{ key: "expense", label: "Beban", count: counts.expense },
		];

	return (
		<div className="space-y-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative flex-1 sm:max-w-xs">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Cari kode / nama akun..."
						className="h-9 w-full rounded-md border border-border-default bg-surface-2 pl-9 pr-3 text-fluid-caption placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
					/>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border-default bg-surface-2 p-1 text-[11px]">
						{filterOptions.map((o) => {
							const active = o.key === filter;
							return (
								<button
									key={o.key}
									type="button"
									onClick={() => setFilter(o.key)}
									aria-pressed={active}
									className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
										active
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:bg-surface-3 hover:text-foreground"
									}`}
								>
									{o.label}
									<span
										className={`tabular ${active ? "opacity-80" : "text-muted-foreground/70"}`}
									>
										{o.count}
									</span>
								</button>
							);
						})}
					</div>
					<label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border-default bg-surface-2 px-3 py-1.5 text-fluid-caption">
						<input
							type="checkbox"
							checked={showInactive}
							onChange={(e) => setShowInactive(e.target.checked)}
							className="size-3.5"
						/>
						Tampilkan nonaktif
					</label>
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada akun yang cocok.
				</div>
			) : (
				<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
					<ResponsiveTable<CoaRow>
						keyExtractor={(r) => r.code}
						rows={filtered}
						columns={columns}
					/>
				</div>
			)}
		</div>
	);
}
