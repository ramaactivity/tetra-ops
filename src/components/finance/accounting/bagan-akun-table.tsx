"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import {
	normalSide,
	TYPE_LABEL,
	TYPE_MEANING,
	TYPE_ORDER,
} from "@/lib/finance/accounting";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CoaRow = {
	code: string;
	name: string;
	account_type: string;
	parent_code: string | null;
	description: string | null;
	is_active: boolean;
	debit: number;
	credit: number;
	balance: number;
};

type Filter = "all" | "asset" | "liability" | "equity" | "revenue" | "expense";

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
	{ key: "all", label: "Semua" },
	{ key: "asset", label: "Aset" },
	{ key: "liability", label: "Kewajiban" },
	{ key: "equity", label: "Ekuitas" },
	{ key: "revenue", label: "Pendapatan" },
	{ key: "expense", label: "Beban" },
];

export function BaganAkunTable({ rows }: { rows: CoaRow[] }) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("all");
	const [showInactive, setShowInactive] = useState(false);

	// Skip header/parent rows (e.g. "1-000 ASSETS") — only postable accounts.
	const accountRows = useMemo(
		() => rows.filter((r) => r.parent_code !== null || r.code.includes("-")),
		[rows],
	);

	const counts = useMemo(() => {
		const out: Record<string, number> = { all: 0 };
		for (const r of accountRows) {
			if (!r.is_active && !showInactive) continue;
			out.all += 1;
			out[r.account_type] = (out[r.account_type] ?? 0) + 1;
		}
		return out;
	}, [accountRows, showInactive]);

	const visible = useMemo(() => {
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

	const groups = useMemo(() => {
		const map = new Map<string, CoaRow[]>();
		for (const r of visible) {
			const arr = map.get(r.account_type) ?? [];
			arr.push(r);
			map.set(r.account_type, arr);
		}
		const out: { type: string; items: CoaRow[]; subtotal: number }[] = [];
		for (const t of TYPE_ORDER) {
			const items = map.get(t);
			if (!items) continue;
			const subtotal = items.reduce((s, r) => s + r.balance, 0);
			out.push({ type: t, items, subtotal });
		}
		return out;
	}, [visible]);

	if (accountRows.length === 0) {
		return (
			<EmptyState
				title="Bagan Akun belum di-seed"
				description="Jalankan migration seed chart_of_accounts dulu — di production biasanya sudah ada."
			/>
		);
	}

	return (
		<div className="space-y-4">
			{/* Toolbar */}
			<div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
				<div className="relative flex-1 lg:max-w-xs">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Cari kode / nama akun…"
						aria-label="Cari akun"
						className="h-9 w-full rounded-md border border-border-default bg-card pl-9 pr-3 text-[13px] placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground/15"
					/>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-border-default bg-secondary p-0.5">
						{FILTERS.map((o) => {
							const active = o.key === filter;
							return (
								<button
									key={o.key}
									type="button"
									onClick={() => setFilter(o.key)}
									aria-pressed={active}
									className={cn(
										"inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
										active
											? "bg-card text-foreground shadow-[var(--shadow-level-2)]"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{o.label}
									<span className="tabular text-[11px] text-muted-foreground">
										{counts[o.key] ?? 0}
									</span>
								</button>
							);
						})}
					</div>
					<label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md border border-border-default bg-card px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground">
						<input
							type="checkbox"
							checked={showInactive}
							onChange={(e) => setShowInactive(e.target.checked)}
							className="size-3.5 accent-foreground"
						/>
						Tampilkan nonaktif
					</label>
				</div>
			</div>

			{groups.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-secondary/40 p-8 text-center text-[13px] text-muted-foreground">
					Tidak ada akun yang cocok dengan pencarian.
				</div>
			) : (
				<div className="space-y-3">
					{groups.map((g) => (
						<AccountGroup
							key={g.type}
							type={g.type}
							items={g.items}
							subtotal={g.subtotal}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function AccountGroup({
	type,
	items,
	subtotal,
}: {
	type: string;
	items: CoaRow[];
	subtotal: number;
}) {
	return (
		<section className="overflow-hidden rounded-lg border border-border-default bg-card">
			<header className="flex items-center justify-between gap-3 border-b border-border-subtle bg-secondary/50 px-4 py-2.5">
				<div className="flex items-baseline gap-2">
					<h3 className="text-[13px] font-semibold text-foreground">
						{TYPE_LABEL[type] ?? type}
					</h3>
					<span className="hidden text-[11px] text-muted-foreground sm:inline">
						{TYPE_MEANING[type]}
					</span>
				</div>
				<div className="flex items-baseline gap-2 text-right">
					<span className="eyebrow">Saldo</span>
					<span
						className={cn(
							"tabular text-[14px] font-semibold",
							subtotal < 0 ? "text-destructive" : "text-foreground",
						)}
					>
						{formatRupiah(subtotal)}
					</span>
				</div>
			</header>
			<ul className="divide-y divide-border-subtle">
				{items.map((r) => (
					<li key={r.code}>
						<AccountRow row={r} />
					</li>
				))}
			</ul>
		</section>
	);
}

function AccountRow({ row }: { row: CoaRow }) {
	const used = row.debit > 0 || row.credit > 0;
	return (
		<Link
			href={`/finance/accounting/ledger/${encodeURIComponent(row.code)}`}
			className="group grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:outline-none sm:grid-cols-[5.5rem_1fr_auto_auto]"
			title={`Buka buku besar ${row.code}`}
		>
			<span className="tabular text-[12px] font-medium text-muted-foreground">
				{row.code}
			</span>
			<span className="min-w-0">
				<span
					className={cn(
						"block truncate text-[13px] font-medium",
						row.is_active ? "text-foreground" : "text-muted-foreground",
					)}
				>
					{row.name}
					{!row.is_active && (
						<span className="ml-2 align-middle text-[10px] font-normal text-muted-foreground">
							nonaktif
						</span>
					)}
				</span>
				{row.description && (
					<span className="block truncate text-[11px] text-muted-foreground">
						{row.description}
					</span>
				)}
			</span>
			<span className="hidden text-right sm:block">
				<span className="eyebrow text-[10px]">
					{normalSide(row.account_type)}
				</span>
			</span>
			<span className="flex items-center justify-end gap-1.5 text-right">
				{used ? (
					<span
						className={cn(
							"tabular text-[13px] font-semibold",
							row.balance < 0 ? "text-destructive" : "text-foreground",
						)}
					>
						{formatRupiah(row.balance)}
					</span>
				) : (
					<span className="tabular text-[13px] text-muted-foreground/40">
						—
					</span>
				)}
				<ArrowRight className="size-3.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
			</span>
		</Link>
	);
}
