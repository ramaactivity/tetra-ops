"use client";

import { AlertTriangle, Loader2, Unlock } from "lucide-react";
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
import { reopenSettlement } from "@/lib/actions/settle-event";

type Props = {
	eventId: string;
	projectId: string;
	isSuperAdmin: boolean;
	isReopened: boolean;
};

export function ReopenButton({
	eventId,
	projectId,
	isSuperAdmin,
	isReopened,
}: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [pending, startTransition] = useTransition();

	const disabledReason = !isSuperAdmin
		? "Hanya super_admin yang bisa reopen settlement"
		: isReopened
			? "Settlement ini sudah pernah di-reopen"
			: undefined;

	function handleConfirm() {
		if (reason.trim().length < 5) {
			toast.error("Alasan reopen minimal 5 karakter");
			return;
		}
		startTransition(async () => {
			const result = await reopenSettlement(eventId, projectId, reason);
			if (!result.ok) {
				toast.error(result.error || "Gagal reopen settlement");
				return;
			}
			toast.success("Settlement berhasil di-reopen. Stock & journal sudah direverse.");
			setOpen(false);
			setReason("");
			router.refresh();
		});
	}

	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => setOpen(true)}
				disabled={Boolean(disabledReason)}
				title={disabledReason}
				className="gap-1.5 text-amber-700 hover:bg-amber-50 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
			>
				<Unlock className="h-3.5 w-3.5" />
				Reopen settlement
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-amber-600" />
							Reopen settlement
						</DialogTitle>
						<DialogDescription>
							Operasi ini akan me-reverse semua perubahan dari settlement.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3">
						<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
							<p className="font-semibold text-amber-900 dark:text-amber-200">
								Apa yang akan dijalankan:
							</p>
							<ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900 dark:text-amber-200">
								<li>Restore stok warehouse (positive movements yang offset deduction)</li>
								<li>Reverse journal entries (entry baru dengan debit/credit dibalik)</li>
								<li>Reverse alokasi sinking funds (withdrawal movements)</li>
								<li>Reverse alokasi owner pool (adjustment negative)</li>
								<li>Unlock event + recap (status balik ke awaiting_settlement)</li>
								<li>Audit log dengan timestamp + alasan + actor</li>
							</ul>
						</div>

						<div className="space-y-1.5">
							<label
								htmlFor="reopen-reason"
								className="text-sm font-medium text-foreground"
							>
								Alasan reopen <span className="text-amber-700">*</span>
							</label>
							<textarea
								id="reopen-reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="Contoh: koreksi salah input HPP, fee crew berubah, dll. Minimal 5 karakter."
								rows={3}
								className="w-full rounded-md border border-border-default bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
							/>
							<p className="text-xs text-muted-foreground">
								Alasan akan disimpan di audit log dan jadi referensi historical.
							</p>
						</div>
					</div>

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
							disabled={pending || reason.trim().length < 5}
						>
							{pending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Memproses…
								</>
							) : (
								"Konfirmasi reopen"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
