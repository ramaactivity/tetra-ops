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
			enabled: boolean;
			committed: boolean;
	  }
	| { phase: "error"; message: string };

/**
 * Stock deduction preview shown before owner approves. Loads
 * planRekapDeduction output from the server and renders each line with
 * before→after stock context, bonus highlight, and rolling HPP total.
 *
 * Stock-before is reconstructed by inspecting the deduct context — but
 * the server action doesn't currently return it. So we render the
 * deduction qty + cost; pre/post-stock visualization is best-effort
 * unless we extend the server action. For now, just emphasize source
 * labels and bonus rows visually.
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
					enabled: res.autoDeductEnabled,
					committed: res.alreadyCommitted,
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

	const { lines, missing, enabled, committed } = state;

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
					<p className="text-sm font-medium">
						Auto-deduct stock dimatikan
					</p>
				</div>
				<p className="text-fluid-caption text-amber-900/80 dark:text-amber-200/80">
					Toggle di <code className="font-mono">/settings → integrity</code>.
					Approve rekap akan tetap jalan tapi tidak emit stock_movements.
				</p>
			</div>
		);
	}

	const total = lines.length;
	const totalCost = lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);

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
					Tidak ada konsumsi yang ter-mapped. Approve tetap bisa, tapi tidak
					ada side-effect ke warehouse.
				</div>
			) : (
				<ul className="space-y-2">
					{lines.map((l, idx) => {
						const isBonus = l.source_label.startsWith("bonus:");
						const isExtra = l.source_label.startsWith("extra:");
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
								</div>
								<div className="flex items-baseline gap-3 sm:flex-col sm:items-end sm:gap-0.5">
									<p className="tabular text-sm font-semibold text-foreground">
										−{l.qty.toLocaleString("id-ID")}
									</p>
									<p className="tabular text-[11px] text-muted-foreground">
										{formatRupiah(l.qty * l.unit_cost)}
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
							{missing.map((m) => REKAP_FIELD_LABELS[m]).join(", ")}. Field
							ini akan di-skip dari deduksi.
						</p>
						<a
							href="/warehouse/rekap-mapping"
							className="mt-1 inline-block font-semibold underline hover:no-underline"
						>
							Lengkapi mapping →
						</a>
					</div>
				</div>
			)}
		</div>
	);
}
