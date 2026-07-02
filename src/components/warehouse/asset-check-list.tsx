"use client";

import { Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import {
	AssetCheckLineRow,
	type AssetCheckRow,
} from "@/components/warehouse/asset-check-line-row";

type FilterKey = "all" | "pending" | "ada" | "rusak" | "hilang";

const FILTER_TABS: ReadonlyArray<{ key: FilterKey; label: string }> = [
	{ key: "all", label: "Semua" },
	{ key: "pending", label: "Belum" },
	{ key: "ada", label: "Ada" },
	{ key: "rusak", label: "Rusak" },
	{ key: "hilang", label: "Hilang" },
];

export function AssetCheckList({
	rows,
	editable,
}: {
	rows: AssetCheckRow[];
	editable: boolean;
}) {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<FilterKey>("all");

	const counts = useMemo(
		() => ({
			all: rows.length,
			pending: rows.filter((r) => r.result === null).length,
			ada: rows.filter((r) => r.result === "ada").length,
			rusak: rows.filter((r) => r.result === "rusak").length,
			hilang: rows.filter((r) => r.result === "hilang").length,
		}),
		[rows],
	);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		let out = rows;
		if (q) {
			out = out.filter(
				(r) =>
					r.item.name.toLowerCase().includes(q) ||
					r.item.sku.toLowerCase().includes(q) ||
					(r.item.asset_number ?? "").toLowerCase().includes(q) ||
					(r.item.serial_number ?? "").toLowerCase().includes(q),
			);
		}
		if (filter === "pending") out = out.filter((r) => r.result === null);
		else if (filter !== "all") out = out.filter((r) => r.result === filter);
		return [...out].sort((a, b) => a.item.name.localeCompare(b.item.name));
	}, [rows, query, filter]);

	if (rows.length === 0) {
		return (
			<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-8 text-center">
				<Wrench className="mx-auto mb-2 size-8 text-muted-foreground/60" />
				<p className="text-fluid-body text-muted-foreground">
					Tidak ada aset tetap aktif untuk dicek.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<FilterSearchInput
					className="flex-1 sm:max-w-xs"
					value={query}
					onValueChange={setQuery}
					placeholder="Cari alat / nomor aset..."
				/>
				<div className="inline-flex h-8 items-center gap-0.5 self-start rounded-full border border-border-subtle bg-card p-0.5 text-[12px] shadow-[var(--shadow-level-1)]">
					{FILTER_TABS.map((t) => {
						const active = t.key === filter;
						return (
							<button
								key={t.key}
								type="button"
								onClick={() => setFilter(t.key)}
								className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium transition-colors ${
									active
										? "bg-[#059669] text-white"
										: "text-muted-foreground hover:bg-secondary hover:text-foreground"
								}`}
								aria-pressed={active}
							>
								{t.label}
								<span
									className={`tabular ${active ? "opacity-80" : "text-muted-foreground/70"}`}
								>
									{counts[t.key]}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-6 text-center text-fluid-caption text-muted-foreground">
					Tidak ada alat yang cocok dengan filter ini.
				</div>
			) : (
				<div className="space-y-2">
					{filtered.map((r) => (
						<AssetCheckLineRow key={r.item_id} line={r} editable={editable} />
					))}
				</div>
			)}
		</div>
	);
}
