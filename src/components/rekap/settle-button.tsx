"use client";

import { AlertTriangle, CheckCircle2, Lock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
	checkRecapStock,
	type StockCheckShortage,
} from "@/lib/actions/profit-preview";
import { settleEvent } from "@/lib/actions/settle-event";
import { formatRupiah } from "@/lib/format";

type Props = {
	eventId: string;
	projectId: string;
	recapId: string | null;
	revenueNet: number;
	hppTotal: number;
	opexTotal: number;
	netProfit: number;
	sinkingEstimate: number;
	ownerPoolEstimate: number;
	disabled: boolean;
	disabledReason?: string;
};

export function SettleButton(props: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [stockChecking, setStockChecking] = useState(false);
	const [shortages, setShortages] = useState<StockCheckShortage[]>([]);
	const [pending, startTransition] = useTransition();

	async function handleOpen() {
		if (!props.recapId) {
			toast.error("Recap belum ada untuk event ini");
			return;
		}
		setStockChecking(true);
		setShortages([]);
		const check = await checkRecapStock(props.recapId);
		setStockChecking(false);
		if (!check.ok) {
			toast.error(check.error);
			return;
		}
		if (!check.sufficient) {
			setShortages(check.shortages);
		}
		setOpen(true);
	}

	function handleConfirm() {
		startTransition(async () => {
			const result = await settleEvent(props.eventId, props.projectId);
			if (!result.ok) {
				toast.error(result.error || "Gagal settle event");
				return;
			}
			toast.success(
				`Event berhasil di-settle. Net profit: ${formatRupiah(result.data.net_profit)}`,
			);
			setOpen(false);
			router.refresh();
		});
	}

	const hasShortage = shortages.length > 0;

	return (
		<>
			<Button
				onClick={handleOpen}
				disabled={props.disabled || stockChecking}
				title={props.disabledReason}
				className="h-10 gap-2"
			>
				{stockChecking ? (
					<>
						<Loader2 className="h-4 w-4 animate-spin" />
						Cek stok…
					</>
				) : (
					<>
						<Lock className="h-4 w-4" />
						Settle event
					</>
				)}
			</Button>
			{props.disabled && props.disabledReason && (
				<p className="mt-2 text-xs text-muted-foreground">
					{props.disabledReason}
				</p>
			)}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							{hasShortage ? (
								<AlertTriangle className="h-5 w-5 text-amber-600" />
							) : (
								<CheckCircle2 className="h-5 w-5 text-foreground" />
							)}
							Konfirmasi settle event
						</DialogTitle>
						<DialogDescription>
							Settlement akan mengubah data secara permanen.
							Aksi ini hanya bisa di-reverse via Reopen Settlement (super-admin).
						</DialogDescription>
					</DialogHeader>

					{hasShortage ? (
						<>
							<div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
								<p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
									⚠ Stok minus setelah settle untuk {shortages.length} item:
								</p>
								<ul className="mt-2 space-y-1 text-xs text-amber-900 dark:text-amber-200">
									{shortages.map((s) => (
										<li key={s.item_id} className="tabular">
											<span className="font-medium">{s.sku}</span> · {s.name}
											: butuh {s.needed}, ada {s.available} (akan minus{" "}
											<span className="font-semibold">{s.shortage}</span>)
										</li>
									))}
								</ul>
								<p className="mt-3 text-xs text-amber-900 dark:text-amber-200">
									Settlement tetap bisa lanjut. Stok akan negatif sampai restock berikutnya.
								</p>
							</div>
							<div className="mt-3 space-y-3 rounded-md border border-border-default bg-surface-2 p-3 text-sm">
								<p className="text-xs uppercase tracking-wider text-muted-foreground">
									Aksi yang akan dijalankan
								</p>
								<ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
									<li>Potong stok warehouse sesuai konsumsi rekap (bisa minus)</li>
									<li>Generate journal entries (double-entry GL)</li>
									<li>Alokasi sinking funds (estimasi {formatRupiah(props.sinkingEstimate)})</li>
									<li>Alokasi owner pool (estimasi {formatRupiah(props.ownerPoolEstimate)})</li>
									<li>Lock event + recap</li>
									<li>Audit log + stock warning entry</li>
								</ul>

								<div className="rounded-md border border-border-default bg-surface-3 p-3 text-sm">
									<dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
										<dt className="text-muted-foreground">Revenue net</dt>
										<dd className="tabular text-right text-foreground">{formatRupiah(props.revenueNet)}</dd>
										<dt className="text-muted-foreground">HPP</dt>
										<dd className="tabular text-right text-foreground">{formatRupiah(props.hppTotal)}</dd>
										<dt className="text-muted-foreground">OpEx</dt>
										<dd className="tabular text-right text-foreground">{formatRupiah(props.opexTotal)}</dd>
										<dt className="border-t border-border-default pt-1.5 text-sm font-medium text-foreground">Net profit</dt>
										<dd className="tabular border-t border-border-default pt-1.5 text-right text-sm font-semibold text-foreground">
											{formatRupiah(props.netProfit)}
										</dd>
									</dl>
								</div>
							</div>
						</>
					) : (
						<div className="space-y-3 rounded-md border border-border-default bg-surface-2 p-3 text-sm">
							<p className="text-xs uppercase tracking-wider text-muted-foreground">
								Aksi yang akan dijalankan
							</p>
							<ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
								<li>Potong stok warehouse sesuai konsumsi rekap</li>
								<li>Generate journal entries (double-entry GL)</li>
								<li>Alokasi sinking funds (estimasi {formatRupiah(props.sinkingEstimate)})</li>
								<li>Alokasi owner pool (estimasi {formatRupiah(props.ownerPoolEstimate)})</li>
								<li>Lock event + recap (tidak bisa di-edit lagi)</li>
								<li>Audit log dengan timestamp + actor</li>
							</ul>

							<div className="rounded-md border border-border-default bg-surface-3 p-3 text-sm">
								<dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
									<dt className="text-muted-foreground">Revenue net</dt>
									<dd className="tabular text-right text-foreground">
										{formatRupiah(props.revenueNet)}
									</dd>
									<dt className="text-muted-foreground">HPP</dt>
									<dd className="tabular text-right text-foreground">
										{formatRupiah(props.hppTotal)}
									</dd>
									<dt className="text-muted-foreground">OpEx</dt>
									<dd className="tabular text-right text-foreground">
										{formatRupiah(props.opexTotal)}
									</dd>
									<dt className="border-t border-border-default pt-1.5 text-sm font-medium text-foreground">
										Net profit
									</dt>
									<dd className="tabular border-t border-border-default pt-1.5 text-right text-sm font-semibold text-foreground">
										{formatRupiah(props.netProfit)}
									</dd>
								</dl>
							</div>
						</div>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={pending}
						>
							Batal
						</Button>
						<Button
							type="button"
							onClick={handleConfirm}
							disabled={pending}
						>
							{pending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Settling…
								</>
							) : (
								"Konfirmasi settle"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
