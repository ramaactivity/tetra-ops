"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { formatRupiah } from "@/lib/format";

export type WastageRow = {
	id: string;
	ref_id: string;
	qty_base: number;
	reason: string;
	reason_detail: string | null;
	cost_at_time: number;
	evidence_url: string | null;
	created_at: string;
	item: {
		id: string;
		sku: string;
		name: string;
		unit: string;
	} | null;
	supplier: { id: string; name: string } | null;
	event: { id: string; project_id: string; client_name: string } | null;
	reporter: { id: string; full_name: string } | null;
};

const REASON_LABELS: Record<string, { label: string; tone: string }> = {
	testing: {
		label: "Testing",
		tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
	defective_on_arrival: {
		label: "DOA Supplier",
		tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
	},
	handling_damage: {
		label: "Handling",
		tone: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
	},
	production_reject: {
		label: "Production Reject",
		tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
	},
	expired: {
		label: "Expired",
		tone: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
	},
	customer_returned: {
		label: "Customer Returned",
		tone: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
	},
	opname_shortage: {
		label: "Opname Shortage",
		tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
	},
	other: {
		label: "Lainnya",
		tone: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
	},
};

const REASON_FILTERS = [
	{ key: "all", label: "Semua" },
	{ key: "testing", label: "Testing" },
	{ key: "defective_on_arrival", label: "DOA" },
	{ key: "handling_damage", label: "Handling" },
	{ key: "production_reject", label: "Reject" },
	{ key: "opname_shortage", label: "Opname" },
];

export function WastageListTable({ rows }: { rows: WastageRow[] }) {
	const [filter, setFilter] = useState<string>("all");
	const [query, setQuery] = useState<string>("");

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((r) => {
			if (filter !== "all" && r.reason !== filter) return false;
			if (!q) return true;
			if (r.ref_id.toLowerCase().includes(q)) return true;
			if (r.item?.name.toLowerCase().includes(q)) return true;
			if (r.item?.sku.toLowerCase().includes(q)) return true;
			if (r.reason_detail?.toLowerCase().includes(q)) return true;
			if (r.supplier?.name.toLowerCase().includes(q)) return true;
			return false;
		});
	}, [rows, filter, query]);

	const totalCost = useMemo(
		() => filtered.reduce((s, r) => s + (r.cost_at_time ?? 0), 0),
		[filtered],
	);
	const totalQty = filtered.length;

	if (rows.length === 0) {
		return (
			<EmptyState
				icon={ExternalLink}
				title="Belum ada wastage tercatat"
				description="Klik 'Catat Wastage' kalau ada item yang harus dikeluarkan dari stok karena rusak, gagal cetak, atau testing."
			/>
		);
	}

	return (
		<div className="space-y-3">
			{/* Filter chips */}
			<div className="flex flex-wrap items-center gap-2">
				{REASON_FILTERS.map((f) => {
					const isActive = filter === f.key;
					return (
						<button
							key={f.key}
							type="button"
							onClick={() => setFilter(f.key)}
							className={`inline-flex h-8 items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
								isActive
									? "border-[#059669] bg-[#059669] text-white"
									: "border-border-default bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
							}`}
						>
							{f.label}
						</button>
					);
				})}
				<FilterSearchInput
					className="ml-auto w-56"
					value={query}
					onValueChange={setQuery}
					placeholder="Cari ref / item / supplier…"
				/>
			</div>

			{/* Totals strip */}
			<div className="grid grid-cols-2 gap-3 rounded-lg border border-border-default bg-card px-5 py-3.5 sm:grid-cols-3">
				<div>
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Total Entry
					</div>
					<div className="mt-0.5 text-base font-semibold tabular text-foreground">
						{totalQty}
					</div>
				</div>
				<div>
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Total Loss (Cost)
					</div>
					<div className="mt-0.5 text-base font-semibold tabular text-rose-700 dark:text-rose-300">
						{formatRupiah(totalCost)}
					</div>
				</div>
				<div className="hidden sm:block">
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Periode
					</div>
					<div className="mt-0.5 text-[12px] text-muted-foreground">
						{filtered.length > 0
							? `${new Date(filtered[filtered.length - 1].created_at).toLocaleDateString("id-ID")} → ${new Date(filtered[0].created_at).toLocaleDateString("id-ID")}`
							: "—"}
					</div>
				</div>
			</div>

			{/* List */}
			<div className="overflow-hidden rounded-lg border border-border-default bg-card">
				{filtered.length === 0 ? (
					<div className="px-4 py-8 text-center text-sm text-muted-foreground">
						Tidak ada wastage yang cocok dengan filter.
					</div>
				) : (
					<ul>
						{filtered.map((r, idx) => {
							const reasonInfo = REASON_LABELS[r.reason] ?? {
								label: r.reason,
								tone: "bg-zinc-500/10 text-zinc-700",
							};
							return (
								<li
									key={r.id}
									className={`grid gap-2 px-5 py-3.5 transition-colors hover:bg-secondary/40 sm:grid-cols-[1fr_auto] sm:items-start ${
										idx > 0 ? "border-t border-border-subtle" : ""
									}`}
								>
									<div className="min-w-0 space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<span
												className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ${reasonInfo.tone}`}
											>
												{reasonInfo.label}
											</span>
											<span className="text-sm font-semibold text-foreground">
												{r.item?.name ?? "Item terhapus"}
											</span>
											<span className="tabular text-[11px] text-muted-foreground">
												{r.item?.sku}
											</span>
										</div>
										<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
											<span className="tabular">
												{r.qty_base.toLocaleString("id-ID", {
													maximumFractionDigits: 4,
												})}{" "}
												{r.item?.unit ?? ""}
											</span>
											<span>·</span>
											<span>
												{new Date(r.created_at).toLocaleDateString("id-ID")}
											</span>
											{r.reporter && (
												<>
													<span>·</span>
													<span>by {r.reporter.full_name}</span>
												</>
											)}
											{r.supplier && (
												<>
													<span>·</span>
													<span>supplier {r.supplier.name}</span>
												</>
											)}
											{r.event && (
												<>
													<span>·</span>
													<Link
														href={`/operations/${r.event.project_id}`}
														className="text-primary hover:underline"
													>
														{r.event.project_id}
													</Link>
												</>
											)}
										</div>
										{r.reason_detail && (
											<p className="text-[12px] text-muted-foreground italic">
												"{r.reason_detail}"
											</p>
										)}
									</div>
									<div className="flex flex-col items-end gap-1">
										<div className="tabular text-sm font-semibold text-rose-700 dark:text-rose-300">
											{formatRupiah(r.cost_at_time)}
										</div>
										<div className="text-[11px] text-muted-foreground tabular">
											{r.ref_id}
										</div>
										{r.evidence_url && (
											<a
												href={r.evidence_url}
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
											>
												<ExternalLink className="size-3" /> bukti foto
											</a>
										)}
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
