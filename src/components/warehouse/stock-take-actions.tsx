"use client";

import { CheckCircle2, Equal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
	cancelStockTake,
	commitStockTake,
	matchAllToSystem,
} from "@/lib/actions/stock-takes";

/**
 * Sticky bottom action bar for an editable Stock Opname.
 *
 * Three CTAs:
 *  - Match Semua: bulk-set counted_qty = system_qty for every unaudited row.
 *  - Cancel: abort the draft.
 *  - Commit: generate adjustment movements from the variance rows.
 */
export function StockTakeActions({
	stockTakeId,
	varianceCount,
	auditedCount,
	totalLines,
}: {
	stockTakeId: string;
	varianceCount: number;
	auditedCount: number;
	totalLines: number;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [confirmCommit, setConfirmCommit] = useState(false);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [confirmMatch, setConfirmMatch] = useState(false);
	const pendingCount = Math.max(0, totalLines - auditedCount);
	const allMatched = pendingCount === 0 && varianceCount === 0;
	const hasVariance = varianceCount > 0;

	function handleCommit() {
		startTransition(async () => {
			const res = await commitStockTake(stockTakeId);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(
					`Committed — ${res.movements} adjustment movement${res.movements === 1 ? "" : "s"} dibuat`,
				);
				setConfirmCommit(false);
				router.refresh();
			}
		});
	}

	function handleCancel() {
		startTransition(async () => {
			const res = await cancelStockTake(stockTakeId);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success("Stock opname dibatalkan");
				setConfirmCancel(false);
				router.push("/warehouse/stock-take");
			}
		});
	}

	function handleMatchAll() {
		startTransition(async () => {
			const res = await matchAllToSystem(stockTakeId);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(
					res.matched === 0
						? "Tidak ada item yang belum dihitung"
						: `${res.matched} item di-set sesuai stok sistem`,
				);
				setConfirmMatch(false);
				router.refresh();
			}
		});
	}

	const commitTitle = !hasVariance
		? "Tidak ada selisih — stock fisik sama dengan sistem. Kalau mau tutup tanpa adjustment, pakai Cancel."
		: undefined;

	return (
		<>
			{/* Sticky bottom commit bar */}
			<div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border-default bg-surface-1/95 backdrop-blur supports-[backdrop-filter]:bg-surface-1/80">
				<div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
					<div className="flex min-w-0 flex-col gap-0.5 text-fluid-caption">
						<div className="flex items-center gap-2">
							<span className="font-semibold tabular text-foreground">
								{auditedCount}/{totalLines}
							</span>
							<span className="text-muted-foreground">dihitung</span>
							{hasVariance && (
								<span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
									{varianceCount} selisih
								</span>
							)}
							{allMatched && (
								<span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
									semua sesuai
								</span>
							)}
						</div>
						<div className="hidden text-[11px] text-muted-foreground sm:block">
							{pendingCount > 0
								? `${pendingCount} item belum dihitung — bisa "Match Semua" buat anggap sesuai sistem.`
								: `Siap commit — akan generate ${varianceCount} adjustment.`}
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{pendingCount > 0 && (
							<button
								type="button"
								onClick={() => setConfirmMatch(true)}
								disabled={pending}
								className="press-down inline-flex h-9 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium hover:bg-surface-3 disabled:opacity-40"
								title={`Set ${pendingCount} item belum dihitung = sistem`}
							>
								<Equal className="size-3.5" />
								Match Semua ({pendingCount})
							</button>
						)}
						<button
							type="button"
							onClick={() => setConfirmCancel(true)}
							disabled={pending}
							className="press-down inline-flex h-9 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium text-muted-foreground hover:bg-surface-3 disabled:opacity-40"
						>
							<X className="size-3.5" />
							Cancel
						</button>
						<button
							type="button"
							onClick={() => setConfirmCommit(true)}
							disabled={pending || !hasVariance}
							title={commitTitle}
							aria-disabled={!hasVariance}
							className="press-down inline-flex h-9 items-center gap-1.5 rounded-md bg-primary dark:bg-primary px-3 text-fluid-caption font-medium text-white hover:bg-primary/90 dark:hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
						>
							<CheckCircle2 className="size-3.5" />
							Commit ({varianceCount})
						</button>
					</div>
				</div>
			</div>

			<ConfirmDialog
				open={confirmCommit}
				onOpenChange={setConfirmCommit}
				title="Commit stock opname?"
				description={`Akan generate ${varianceCount} adjustment movement (1 per selisih). Item yang sesuai sistem atau belum dihitung di-skip. Setelah commit, opname ini tidak bisa diedit lagi.`}
				confirmLabel="Commit"
				onConfirm={handleCommit}
			/>
			<ConfirmDialog
				open={confirmCancel}
				onOpenChange={setConfirmCancel}
				title="Batalkan stock opname?"
				description="Counted qty yang sudah di-input akan tetap tersimpan, tapi tidak akan generate stock movements. Status akan jadi 'cancelled'. Draft cancelled bisa dihapus permanen dari list."
				confirmLabel="Ya, batalkan"
				variant="destructive"
				onConfirm={handleCancel}
			/>
			<ConfirmDialog
				open={confirmMatch}
				onOpenChange={setConfirmMatch}
				title="Match semua item ke sistem?"
				description={`${pendingCount} item belum dihitung — akan di-set counted_qty = system_qty (anggap fisik sama dengan sistem). Item yang sudah dihitung manual tidak akan ditimpa.`}
				confirmLabel="Match Semua"
				onConfirm={handleMatchAll}
			/>
		</>
	);
}
