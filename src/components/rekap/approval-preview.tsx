"use client";

import {
	AlertTriangle,
	Boxes,
	CheckCircle2,
	Gift,
	Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { getRekapApprovalPreview } from "@/lib/actions/rekap";
import { formatRupiah } from "@/lib/format";
import { REKAP_FIELD_LABELS, type RekapField } from "@/lib/rekap-mapping/types";

interface PreviewLine {
	item_id: string;
	sku: string;
	name: string;
	qty: number;
	unit_cost: number;
	source_label: string;
}

type Phase =
	| { phase: "loading" }
	| {
			phase: "ready";
			lines: PreviewLine[];
			missing: RekapField[];
			unknownFrameSize: boolean;
			enabled: boolean;
			committed: boolean;
			stockByItem: Record<string, number>;
	  }
	| { phase: "error"; message: string };

/**
 * Stock deduction preview shown before owner approves. Loads
 * planRekapDeduction output from the server and renders each line with
 * its stok awal → penggunaan → stok akhir, bonus highlight, and rolling
 * HPP total. Stock comes live from get_stock_levels: for a not-yet-committed
 * rekap it's the stock BEFORE this event (so akhir = awal − pakai is a
 * projection); once committed it's already AFTER, so awal is reconstructed
 * as akhir + pakai.
 */
export function RekapApprovalPreview({ rekapId }: { rekapId: string }) {
	const [state, setState] = useState<Phase>({ phase: "loading" });

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const res = await getRekapApprovalPreview(rekapId);
			if (cancelled) return;
			if (!res.ok) {
				setState({ phase: "error", message: res.error });
			} else {
				setState({
					phase: "ready",
					lines: res.lines,
					missing: res.missingMappings,
					unknownFrameSize: res.unknownFrameSize,
					enabled: res.autoDeductEnabled,
					committed: res.alreadyCommitted,
					stockByItem: res.stockByItem,
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [rekapId]);

	if (state.phase === "loading") {
		return (
			<div className="rounded-lg border border-border-default bg-surface-2 p-4 text-fluid-caption text-muted-foreground">
				Memuat preview deduksi stok…
			</div>
		);
	}

	if (state.phase === "error") {
		return (
			<div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-fluid-caption text-rose-700 dark:text-rose-300">
				Gagal load preview: {state.message}
			</div>
		);
	}

	const { lines, missing, unknownFrameSize, enabled, committed, stockByItem } =
		state;

	// Ukuran cetak belum ditentukan → resep media & sleeve tidak ada, jadi
	// approve PASTI ditolak server. Katakan sekarang, sebelum owner menekan
	// tombolnya — dan sebelum dia mengira HPP event ini memang cuma segini.
	if (!committed && unknownFrameSize) {
		return (
			<div className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4">
				<div className="flex items-start gap-2 text-rose-900 dark:text-rose-200">
					<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
					<p className="text-sm font-medium">
						Ukuran cetak belum ditentukan — rekap belum bisa di-approve
					</p>
				</div>
				<p className="text-fluid-caption text-rose-900/85 dark:text-rose-200/85">
					Media &amp; sleeve dihitung dari ukuran cetak (2R/4R/Polaroid). Selama
					ukurannya masih &quot;menyusul&quot;, dua item itu tidak bisa dipotong
					dari stok dan HPP event ini akan tercatat jauh lebih kecil dari
					sebenarnya. Isi frame size di halaman event dulu, lalu buka lagi
					halaman ini.
				</p>
			</div>
		);
	}

	if (committed) {
		return (
			<div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
				<div className="flex items-start gap-2 text-emerald-900 dark:text-emerald-200">
					<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
					<p className="text-sm font-medium">Stok sudah dikurangi</p>
				</div>
				<p className="text-fluid-caption text-emerald-900/80 dark:text-emerald-200/80">
					Approval sebelumnya sudah commit deduksi. Reject rekap akan
					auto-create reversal movements (direction=in) di stock log.
				</p>
			</div>
		);
	}

	if (!enabled) {
		return (
			<div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
				<div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
					<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
					<p className="text-sm font-medium">Auto-deduct stock dimatikan</p>
				</div>
				<p className="text-fluid-caption text-amber-900/80 dark:text-amber-200/80">
					Toggle di <code className="font-mono">/settings → integrity</code>.
					Approve rekap akan tetap jalan tapi tidak emit stock_movements.
				</p>
			</div>
		);
	}

	const total = lines.length;
	// Round each line to whole rupiah — same basis as the official HPP snapshot
	// (bucketHpp) + the Ringkasan tab, so all displays + the books agree exactly.
	const lineCost = (l: PreviewLine) => Math.round(l.qty * l.unit_cost);
	const totalCost = lines.reduce((s, l) => s + lineCost(l), 0);

	// Total penggunaan per item (an item can appear in >1 line, e.g. POUCH both
	// standalone + bundled with a flashdisk). Stock awal→akhir is item-level, so
	// it's shown once on the first line of each item.
	const usedByItem = lines.reduce<Record<string, number>>((acc, l) => {
		acc[l.item_id] = (acc[l.item_id] ?? 0) + l.qty;
		return acc;
	}, {});
	const fmtQty = (n: number) =>
		Number(n.toFixed(4)).toLocaleString("id-ID", { maximumFractionDigits: 4 });
	const seenItem = new Set<string>();

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<Boxes className="h-4 w-4 text-primary" />
				<h3 className="text-sm font-semibold tracking-tight">
					Deduksi stok saat approve{" "}
					<span className="text-muted-foreground text-xs font-normal">
						({total} item)
					</span>
				</h3>
			</div>

			{total === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-2 p-4 text-center text-fluid-caption text-muted-foreground">
					Tidak ada konsumsi yang ter-mapped. Approve tetap bisa, tapi tidak ada
					side-effect ke warehouse.
				</div>
			) : (
				<ul className="space-y-2">
					{lines.map((l, idx) => {
						const isBonus = l.source_label.startsWith("bonus:");
						const isExtra = l.source_label.startsWith("extra:");
						// Stock awal → akhir is item-level; show once per item.
						const showStock = !seenItem.has(l.item_id);
						if (showStock) seenItem.add(l.item_id);
						const used = usedByItem[l.item_id] ?? 0;
						const before = stockByItem[l.item_id] ?? 0;
						const after = before - used;
						return (
							<li
								key={`${l.item_id}-${idx}`}
								className={`flex flex-wrap items-baseline justify-between gap-2 rounded-lg border p-3 sm:flex-nowrap ${
									isBonus
										? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
										: isExtra
											? "border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30"
											: "border-border-default bg-surface-2"
								}`}
							>
								<div className="min-w-0 flex-1 space-y-0.5">
									<div className="flex items-center gap-1.5">
										{isBonus && (
											<Gift className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
										)}
										{isExtra && (
											<Sparkles className="h-3 w-3 text-sky-600 dark:text-sky-400" />
										)}
										<p className="truncate text-sm font-medium text-foreground">
											{l.name}
										</p>
										{isBonus && (
											<Badge
												variant="outline"
												className="border-emerald-300 bg-emerald-100 text-[9px] uppercase tracking-wider text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
											>
												Bonus
											</Badge>
										)}
										{isExtra && (
											<Badge
												variant="outline"
												className="border-sky-300 bg-sky-100 text-[9px] uppercase tracking-wider text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
											>
												Extra
											</Badge>
										)}
									</div>
									<p className="font-mono text-[11px] text-muted-foreground">
										{l.sku} · {l.source_label.replace(/^(bonus|extra):\s*/, "")}
									</p>
									{showStock && (
										<p className="text-[11px] text-muted-foreground">
											Stok:{" "}
											<span className="tabular font-medium text-foreground">
												{fmtQty(before)}
											</span>
											{" → "}
											<span
												className={`tabular font-medium ${
													after < 0
														? "text-rose-600 dark:text-rose-400"
														: "text-foreground"
												}`}
											>
												{fmtQty(after)}
											</span>
											<span className="text-muted-foreground/70">
												{" "}
												(pakai {fmtQty(used)})
											</span>
										</p>
									)}
								</div>
								<div className="flex items-baseline gap-3 sm:flex-col sm:items-end sm:gap-0.5">
									<p className="tabular text-sm font-semibold text-foreground">
										−{l.qty.toLocaleString("id-ID")}
									</p>
									<p className="tabular text-[11px] text-muted-foreground">
										{formatRupiah(lineCost(l))}
									</p>
								</div>
							</li>
						);
					})}
					<li className="flex items-baseline justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
						<p className="text-sm font-semibold text-foreground">
							Total HPP terdeduksi
						</p>
						<p className="tabular text-base font-semibold text-primary">
							{formatRupiah(totalCost)}
						</p>
					</li>
				</ul>
			)}

			{missing.length > 0 && (
				<div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-fluid-caption dark:border-amber-900 dark:bg-amber-950/30">
					<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
					<div className="flex-1 text-amber-900 dark:text-amber-200">
						<p className="font-medium">
							{missing.length} field belum di-map ke inventory:
						</p>
						<p className="mt-0.5">
							{missing.map((m) => REKAP_FIELD_LABELS[m]).join(", ")}. SKU-nya
							tidak ditemukan di inventory — field ini di-skip dari deduksi. Cek
							item-nya ada & aktif di Inventaris.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
