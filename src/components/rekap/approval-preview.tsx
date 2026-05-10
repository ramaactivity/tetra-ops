"use client";

import { AlertTriangle, Boxes, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
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

/**
 * Inline panel shown above the Approve/Reject buttons. Loads the
 * deduction plan from server (rekap × mapping × item.purchase_price_avg)
 * so the owner sees exactly what will hit the warehouse before clicking
 * Approve. No-op render when auto-deduct is off or no consumables map.
 */
export function RekapApprovalPreview({ rekapId }: { rekapId: string }) {
	const [state, setState] = useState<
		| { phase: "loading" }
		| { phase: "ready"; lines: PreviewLine[]; missing: RekapField[]; enabled: boolean; committed: boolean }
		| { phase: "error"; message: string }
	>({ phase: "loading" });

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
			<div className="rounded-md border border-border-default bg-surface-2 p-3 text-fluid-caption text-muted-foreground">
				Memuat preview deduksi stok…
			</div>
		);
	}

	if (state.phase === "error") {
		return (
			<div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-fluid-caption text-rose-700 dark:text-rose-300">
				Gagal load preview: {state.message}
			</div>
		);
	}

	const { lines, missing, enabled, committed } = state;

	if (committed) {
		return (
			<div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-fluid-caption text-emerald-700 dark:text-emerald-300">
				<CheckCircle2 className="mr-1 inline size-3.5" />
				Stock untuk rekap ini sudah dikurangi dari approval sebelumnya. Reject
				akan auto-create reversal movements.
			</div>
		);
	}

	if (!enabled) {
		return (
			<div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-fluid-caption text-amber-700 dark:text-amber-300">
				<AlertTriangle className="mr-1 inline size-3.5" />
				Auto-deduct stock OFF (toggle di /settings → integrity). Approve
				rekap tidak akan emit stock_movements.
			</div>
		);
	}

	const total = lines.length;

	return (
		<div className="space-y-2 rounded-md border border-sky-500/30 bg-sky-500/10 p-3">
			<div className="flex items-start gap-2">
				<Boxes className="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-300" />
				<div className="flex-1 space-y-1">
					<p className="text-fluid-caption font-medium text-sky-900 dark:text-sky-200">
						Approve akan auto-kurangi {total} item dari stok:
					</p>
					{total === 0 ? (
						<p className="text-[11px] text-sky-900/80 dark:text-sky-200/80 italic">
							Tidak ada konsumsi yang termapped — rekap masih bisa di-approve
							tanpa side-effect ke warehouse.
						</p>
					) : (
						<ul className="space-y-0.5 text-[11px] text-sky-900/80 dark:text-sky-200/80">
							{lines.map((l, idx) => (
								<li
									key={`${l.item_id}-${idx}`}
									className="tabular flex items-baseline justify-between gap-2"
								>
									<span>
										<span className="font-mono text-[10px] uppercase opacity-70">
											{l.source_label}
										</span>{" "}
										{l.qty}× {l.sku} ({l.name})
									</span>
									<span className="opacity-70">
										@ {formatRupiah(l.unit_cost)} = {" "}
										{formatRupiah(l.qty * l.unit_cost)}
									</span>
								</li>
							))}
							<li className="tabular border-t border-sky-500/30 pt-1 font-semibold">
								Total HPP terhitung:{" "}
								{formatRupiah(
									lines.reduce((s, l) => s + l.qty * l.unit_cost, 0),
								)}
							</li>
						</ul>
					)}
				</div>
			</div>

			{missing.length > 0 && (
				<div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/15 p-2 text-[11px] text-amber-900 dark:text-amber-200">
					<AlertTriangle className="mt-0.5 size-3 shrink-0" />
					<div>
						<span className="font-medium">
							{missing.length} field aktif belum di-map:
						</span>{" "}
						{missing.map((m) => REKAP_FIELD_LABELS[m]).join(", ")}. Field ini
						akan di-skip dari deduksi.{" "}
						<a
							href="/settings/items/mapping"
							className="underline hover:no-underline"
						>
							Lengkapi mapping →
						</a>
					</div>
				</div>
			)}
		</div>
	);
}
