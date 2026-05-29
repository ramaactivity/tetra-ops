"use client";

import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { archiveVendor, restoreVendor } from "@/lib/actions/vendors";

export function ArchiveVendorButton({
	id,
	mode,
}: {
	id: string;
	mode: "archive" | "restore";
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const fn = mode === "archive" ? archiveVendor : restoreVendor;
			const result = await fn(id);
			if (result.ok) {
				toast.success(
					mode === "archive" ? "Vendor di-archive" : "Vendor di-restore",
				);
				router.push("/vendors");
				router.refresh();
			} else {
				toast.error(result.error ?? "Gagal memproses vendor.");
			}
			setOpen(false);
		});
	}

	return (
		<>
			<Button
				type="button"
				variant={mode === "archive" ? "outline" : "default"}
				size="sm"
				onClick={() => setOpen(true)}
				disabled={pending}
			>
				{pending ? (
					<Loader2 className="size-4 animate-spin" />
				) : mode === "archive" ? (
					<Archive className="size-4" />
				) : (
					<ArchiveRestore className="size-4" />
				)}
				{mode === "archive" ? "Archive vendor" : "Restore vendor"}
			</Button>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title={mode === "archive" ? "Archive vendor?" : "Restore vendor?"}
				description={
					mode === "archive"
						? "Vendor akan disembunyikan dari autocomplete booking form. Event history yang sudah link tetap utuh. Bisa di-restore kapan saja."
						: "Vendor akan kembali muncul di booking form autocomplete + filter list."
				}
				confirmLabel={mode === "archive" ? "Archive" : "Restore"}
				onConfirm={handleConfirm}
			/>
		</>
	);
}
