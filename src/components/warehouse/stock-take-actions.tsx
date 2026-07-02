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
 *  - Sisanya Anggap Sesuai: tandai semua baris yang belum dihitung sebagai
 *    "sesuai sistem" (is_match — ikut stok live saat selesai).
 *  - Batalkan: buang draft ini.
 *  - Selesai & Simpan: tutup opname. Selisih → stok disesuaikan + jurnal.
 *    Tanpa selisih pun valid — tersimpan sebagai bukti audit "semua cocok"
 *    (dulu tombol ini mati saat 0 selisih → owner terjebak, satu-satunya
 *    jalan keluar Cancel yang menghapus jejak audit).
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
	const hasVariance = varianceCount > 0;
	const nothingCounted = auditedCount === 0;

	function handleCommit() {
		startTransition(async () => {
			const res = await commitStockTake(stockTakeId);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(
					res.movements === 0
						? "Opname selesai — semua stok cocok, tidak ada yang diubah"
						: `Opname selesai — stok ${res.movements} item disesuaikan`,
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
				toast.success("Opname dibatalkan");
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
						? "Semua item sudah dihitung"
						: `${res.matched} item dianggap sesuai catatan sistem`,
				);
				setConfirmMatch(false);
				router.refresh();
			}
		});
	}

	const statusLine = nothingCounted
		? "Mulai hitung fisik per item, atau anggap semua sesuai kalau cuma mau cek cepat."
		: pendingCount > 0
			? `${pendingCount} item belum dihitung — dihitung dulu, atau anggap sesuai.`
			: hasVariance
				? `Ada ${varianceCount} item yang jumlah fisiknya beda. Klik Selesai untuk menyesuaikan stok.`
				: "Semua cocok. Klik Selesai untuk menyimpan hasil audit.";

	const commitDescription = !hasVariance
		? "Semua jumlah fisik cocok dengan catatan sistem — tidak ada stok yang diubah. Hasil opname tetap tersimpan sebagai bukti audit."
		: `Jumlah fisik ${varianceCount} item beda dengan catatan sistem. Stok akan disesuaikan mengikuti hasil hitunganmu, dan selisihnya otomatis dibukukan. ${
				pendingCount > 0
					? `${pendingCount} item yang belum dihitung tidak akan diubah. `
					: ""
			}Setelah selesai, opname ini tidak bisa diedit lagi.`;

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
									{varianceCount} beda
								</span>
							)}
							{pendingCount === 0 && !hasVariance && (
								<span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
									semua cocok
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
								title={`Anggap ${pendingCount} item yang belum dihitung sesuai catatan sistem`}
							>
								<Equal className="size-3.5" />
								Sisanya Anggap Sesuai ({pendingCount})
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
							disabled={pending || nothingCounted}
							title={
								nothingCounted
									? "Hitung dulu minimal satu item (atau pakai Sisanya Anggap Sesuai)"
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
				title="Selesaikan stock opname?"
				description={commitDescription}
				confirmLabel="Ya, Selesaikan"
				onConfirm={handleCommit}
			/>
			<ConfirmDialog
				open={confirmCancel}
				onOpenChange={setConfirmCancel}
				title="Batalkan stock opname?"
				description="Opname ini ditutup tanpa mengubah stok sama sekali. Angka yang sudah kamu isi tetap tersimpan di riwayat, dan draft yang dibatalkan bisa dihapus dari daftar."
				confirmLabel="Ya, Batalkan"
				variant="destructive"
				onConfirm={handleCancel}
			/>
			<ConfirmDialog
				open={confirmMatch}
				onOpenChange={setConfirmMatch}
				title="Anggap sisanya sesuai?"
				description={`${pendingCount} item yang belum dihitung akan dianggap jumlah fisiknya sama dengan catatan sistem — tidak ada stok yang diubah untuk item ini. Item yang sudah kamu hitung manual tidak disentuh.`}
				confirmLabel="Ya, Anggap Sesuai"
				onConfirm={handleMatchAll}
			/>
		</>
	);
}
