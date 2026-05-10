"use client";

import { CheckCircle2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { cancelStockTake, commitStockTake } from "@/lib/actions/stock-takes";

export function StockTakeActions({
	stockTakeId,
	varianceCount,
}: {
	stockTakeId: string;
	varianceCount: number;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [confirmCommit, setConfirmCommit] = useState(false);
	const [confirmCancel, setConfirmCancel] = useState(false);

	function handleCommit() {
		startTransition(async () => {
			const res = await commitStockTake(stockTakeId);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(
					`Committed — ${res.movements} adjustment movement${res.movements === 1 ? "" : "s"} created`,
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
				toast.success("Stock take cancelled");
				setConfirmCancel(false);
				router.push("/warehouse/stock-take");
			}
		});
	}

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={() => setConfirmCancel(true)}
				disabled={pending}
				className="press-down inline-flex h-9 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium hover:bg-surface-3 disabled:opacity-40"
			>
				<X className="size-3.5" />
				Cancel
			</button>
			<button
				type="button"
				onClick={() => setConfirmCommit(true)}
				disabled={pending}
				className="press-down inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
			>
				<CheckCircle2 className="size-3.5" />
				Commit ({varianceCount})
			</button>

			<ConfirmDialog
				open={confirmCommit}
				onOpenChange={setConfirmCommit}
				title="Commit stock take?"
				description={`Akan generate ${varianceCount} adjustment movement (1 per variance non-zero). Setelah commit, stock-take ini tidak bisa diedit lagi.`}
				confirmLabel="Commit"
				onConfirm={handleCommit}
			/>
			<ConfirmDialog
				open={confirmCancel}
				onOpenChange={setConfirmCancel}
				title="Cancel stock take?"
				description="Lines yang sudah di-input akan tetap tersimpan, tapi tidak akan generate stock movements. Status akan jadi 'cancelled'."
				confirmLabel="Cancel Stock Take"
				variant="destructive"
				onConfirm={handleCancel}
			/>
		</div>
	);
}
