"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { deleteAssetCheck } from "@/lib/actions/asset-checks";

export function DeleteAssetCheckButton({ checkId }: { checkId: string }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	function handleDelete() {
		startTransition(async () => {
			const res = await deleteAssetCheck(checkId);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success("Cek alat dihapus");
				setOpen(false);
				router.refresh();
			}
		});
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				disabled={pending}
				className="press-down inline-flex h-7 items-center justify-center rounded-md border border-border-default bg-surface-2 px-1.5 text-muted-foreground transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-700 disabled:opacity-40 dark:hover:text-rose-300"
				title="Hapus permanen"
				aria-label="Hapus cek alat"
			>
				<Trash2 className="size-3.5" />
			</button>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title="Hapus cek alat?"
				description="Hapus permanen draft yang sudah dibatalkan. Tidak bisa di-undo."
				confirmLabel="Hapus"
				variant="destructive"
				onConfirm={handleDelete}
			/>
		</>
	);
}
