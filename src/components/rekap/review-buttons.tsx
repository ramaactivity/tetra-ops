"use client";

import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { reviewRekap } from "@/lib/actions/rekap";

export function RekapReviewButtons({
	rekapId,
	projectId,
	currentApproved,
	stockCommittedAt = null,
}: {
	rekapId: string;
	projectId: string;
	currentApproved: boolean | null;
	stockCommittedAt?: string | null;
}) {
	const [pending, startTransition] = useTransition();
	const [showReject, setShowReject] = useState(false);
	const [notes, setNotes] = useState("");

	function approve() {
		startTransition(async () => {
			const result = await reviewRekap(rekapId, projectId, true, notes);
			if (result.error) {
				toast.error(result.error);
			} else {
				toast.success("Rekap di-approve");
			}
		});
	}

	function reject() {
		if (!notes.trim()) {
			toast.warning("Wajib isi catatan kalau reject");
			return;
		}
		startTransition(async () => {
			const result = await reviewRekap(rekapId, projectId, false, notes);
			if (result.error) {
				toast.error(result.error);
			} else {
				toast.info("Rekap dikembalikan ke crew untuk revisi");
			}
		});
	}

	function reset() {
		startTransition(async () => {
			const result = await reviewRekap(rekapId, projectId, false, "");
			if (result.error) {
				toast.error(result.error);
			} else {
				toast.info("Rekap di-reopen");
			}
		});
	}

	if (currentApproved === true) {
		return (
			<div className="border-emerald-500/30 bg-emerald-500/10 flex items-start gap-3 rounded-md border p-3">
				<CheckCircle2 className="text-emerald-600 dark:text-emerald-400 mt-0.5 h-4 w-4 shrink-0" />
				<div className="flex-1 space-y-1">
					<p className="text-emerald-700 dark:text-emerald-300 text-sm font-medium">
						Rekap di-approve
					</p>
					<p className="text-emerald-700/80 dark:text-emerald-300/80 text-xs">
						Settlement bisa di-tutup buku dengan data ini.
						{stockCommittedAt
							? " 📦 Stock auto-deducted on approval."
							: " (Stock movements tidak ter-emit — auto-deduct off atau mapping kosong saat approval.)"}
					</p>
				</div>
				<button
					type="button"
					onClick={reset}
					disabled={pending}
					title="Buka kembali untuk revisi"
					className="text-muted-foreground hover:text-foreground inline-flex h-7 items-center gap-1 rounded text-xs underline-offset-2 hover:underline"
				>
					<RotateCcw className="h-3 w-3" />
					Re-open
				</button>
			</div>
		);
	}

	if (currentApproved === false) {
		return (
			<div className="border-rose-500/30 bg-rose-500/10 flex items-start gap-3 rounded-md border p-3">
				<XCircle className="text-rose-600 dark:text-rose-400 mt-0.5 h-4 w-4 shrink-0" />
				<div className="flex-1 space-y-1">
					<p className="text-rose-700 dark:text-rose-300 text-sm font-medium">
						Rekap perlu revisi
					</p>
					<p className="text-rose-700/80 dark:text-rose-300/80 text-xs">
						Crew bisa update form di atas berdasarkan catatan owner.
					</p>
				</div>
				<Button
					type="button"
					variant="decisive"
					size="sm"
					onClick={approve}
					disabled={pending}
				>
					<CheckCircle2 />
					Override approve
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="space-y-1.5">
				<label htmlFor="review_notes" className="text-sm font-medium">
					Catatan review (wajib jika reject)
				</label>
				<textarea
					id="review_notes"
					rows={2}
					maxLength={500}
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					placeholder="Misal: angka cetak ngga sesuai counter mesin"
					className="border-border-default bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none resize-none"
				/>
			</div>
			<div className="flex flex-wrap items-center justify-end gap-2">
				{showReject ? (
					<>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setShowReject(false)}
							disabled={pending}
						>
							Batal
						</Button>
						<Button
							type="button"
							variant="destructive"
							size="lg"
							onClick={reject}
							disabled={pending}
						>
							<XCircle />
							Reject + minta revisi
						</Button>
					</>
				) : (
					<Button
						type="button"
						variant="outline"
						onClick={() => setShowReject(true)}
						disabled={pending}
					>
						<XCircle />
						Reject
					</Button>
				)}
				<Button
					type="button"
					variant="decisive"
					size="lg"
					onClick={approve}
					disabled={pending}
				>
					<CheckCircle2 />
					{pending ? "Memproses…" : "Approve rekap"}
				</Button>
			</div>
		</div>
	);
}
