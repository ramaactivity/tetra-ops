"use client";

import { CheckCircle2, Equal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
	cancelAssetCheck,
	commitAssetCheck,
	matchAllAssetCheck,
} from "@/lib/actions/asset-checks";

/**
 * Sticky bottom action bar untuk Cek Alat yang masih berjalan — alur sama
 * dengan Stock Opname: Sisanya Anggap Ada / Batalkan / Selesai & Simpan.
 * Selesai valid meski semua "ada" (justru itu hasil terbaik) — tercatat
 * sebagai bukti cek rutin.
 */
export function AssetCheckActions({
	checkId,
	checkedCount,
	totalLines,
	rusakCount,
	hilangCount,
}: {
	checkId: string;
	checkedCount: number;
	totalLines: number;
	rusakCount: number;
	hilangCount: number;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [confirmCommit, setConfirmCommit] = useState(false);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [confirmMatch, setConfirmMatch] = useState(false);
	const pendingCount = Math.max(0, totalLines - checkedCount);
	const hasIssue = rusakCount + hilangCount > 0;
	const nothingChecked = checkedCount === 0;

	function handleCommit() {
		startTransition(async () => {
			const res = await commitAssetCheck(checkId);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(
					res.rusak + res.hilang === 0
						? "Cek alat selesai — semua alat ada dan baik"
						: `Cek alat selesai — ${res.rusak} rusak, ${res.hilang} hilang tercatat di register aset`,
				);
				setConfirmCommit(false);
				router.refresh();
			}
		});
	}

	function handleCancel() {
		startTransition(async () => {
			const res = await cancelAssetCheck(checkId);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success("Cek alat dibatalkan");
				setConfirmCancel(false);
				router.push("/warehouse/asset-check");
			}
		});
	}

	function handleMatchAll() {
		startTransition(async () => {
			const res = await matchAllAssetCheck(checkId);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(
					res.matched === 0
						? "Semua alat sudah dicek"
						: `${res.matched} alat dianggap ada`,
				);
				setConfirmMatch(false);
				router.refresh();
			}
		});
	}

	const statusLine = nothingChecked
		? "Tandai tiap alat: Ada, Rusak, atau Hilang. Yang tidak sempat dicek bisa dianggap ada."
		: pendingCount > 0
			? `${pendingCount} alat belum dicek — cek dulu, atau anggap ada.`
			: hasIssue
				? `Ada ${rusakCount + hilangCount} alat bermasalah. Klik Selesai — kondisinya tercatat di register aset.`
				: "Semua alat ada dan baik. Klik Selesai untuk menyimpan hasilnya.";

	const commitDescription = hasIssue
		? `Hasil cek: ${rusakCount} rusak dan ${hilangCount} hilang. Kondisi alat di register aset akan diperbarui mengikuti hasil ini. ${
				pendingCount > 0
					? `${pendingCount} alat yang tidak dicek dibiarkan seperti sebelumnya. `
					: ""
			}Setelah selesai, cek ini tidak bisa diedit lagi.`
		: "Semua alat yang dicek ada dan kondisinya baik. Hasil tersimpan sebagai bukti cek rutin, dan kondisi alat di register ikut diperbarui.";

	return (
		<>
			<div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border-default bg-surface-1/95 backdrop-blur supports-[backdrop-filter]:bg-surface-1/80">
				<div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
					<div className="flex min-w-0 flex-col gap-0.5 text-fluid-caption">
						<div className="flex items-center gap-2">
							<span className="font-semibold tabular text-foreground">
								{checkedCount}/{totalLines}
							</span>
							<span className="text-muted-foreground">dicek</span>
							{rusakCount > 0 && (
								<span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
									{rusakCount} rusak
								</span>
							)}
							{hilangCount > 0 && (
								<span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
									{hilangCount} hilang
								</span>
							)}
							{pendingCount === 0 && !hasIssue && (
								<span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
									semua ada
								</span>
							)}
						</div>
						<div className="hidden text-[11px] text-muted-foreground sm:block">
							{statusLine}
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{pendingCount > 0 && (
							<button
								type="button"
								onClick={() => setConfirmMatch(true)}
								disabled={pending}
								className="press-down inline-flex h-9 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium hover:bg-surface-3 disabled:opacity-40"
								title={`Anggap ${pendingCount} alat yang belum dicek ada & baik`}
							>
								<Equal className="size-3.5" />
								Sisanya Anggap Ada ({pendingCount})
							</button>
						)}
						<button
							type="button"
							onClick={() => setConfirmCancel(true)}
							disabled={pending}
							className="press-down inline-flex h-9 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-fluid-caption font-medium text-muted-foreground hover:bg-surface-3 disabled:opacity-40"
						>
							<X className="size-3.5" />
							Batalkan
						</button>
						<button
							type="button"
							onClick={() => setConfirmCommit(true)}
							disabled={pending || nothingChecked}
							title={
								nothingChecked
									? "Cek dulu minimal satu alat (atau pakai Sisanya Anggap Ada)"
									: undefined
							}
							className="press-down inline-flex h-9 items-center gap-1.5 rounded-md bg-[#059669] dark:bg-[#0b9e6a] px-3 text-fluid-caption font-medium text-white hover:bg-[#047857] dark:hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-40"
						>
							<CheckCircle2 className="size-3.5" />
							Selesai & Simpan
						</button>
					</div>
				</div>
			</div>

			<ConfirmDialog
				open={confirmCommit}
				onOpenChange={setConfirmCommit}
				title="Selesaikan cek alat?"
				description={commitDescription}
				confirmLabel="Ya, Selesaikan"
				onConfirm={handleCommit}
			/>
			<ConfirmDialog
				open={confirmCancel}
				onOpenChange={setConfirmCancel}
				title="Batalkan cek alat?"
				description="Cek ini ditutup tanpa mengubah apa pun di register aset. Tanda yang sudah kamu isi tetap tersimpan di riwayat."
				confirmLabel="Ya, Batalkan"
				variant="destructive"
				onConfirm={handleCancel}
			/>
			<ConfirmDialog
				open={confirmMatch}
				onOpenChange={setConfirmMatch}
				title="Anggap sisanya ada?"
				description={`${pendingCount} alat yang belum dicek akan ditandai "Ada" (dianggap ditemukan dan kondisinya baik). Alat yang sudah kamu tandai manual tidak disentuh.`}
				confirmLabel="Ya, Anggap Ada"
				onConfirm={handleMatchAll}
			/>
		</>
	);
}
