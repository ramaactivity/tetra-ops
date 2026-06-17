"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { deleteEvent } from "@/lib/actions/bookings";

export function DeleteEventButton({
	eventId,
	projectId,
	clientName,
}: {
	eventId: string;
	projectId: string;
	clientName: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	async function handleConfirm() {
		const result = await deleteEvent(eventId);
		if (!result.ok) {
			toast.error(result.error);
			return;
		}
		toast.success(`Project ${projectId} dihapus.`);
		startTransition(() => {
			router.push("/operations");
			router.refresh();
		});
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				disabled={pending}
				className="press-down inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-destructive/30 bg-destructive/5 px-3 text-[12.5px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
			>
				<Trash2 className="h-3.5 w-3.5" />
				Hapus
			</button>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title={`Hapus project ${projectId}?`}
				description={`Project "${clientName}" akan disembunyikan dari semua list (operations, reports, dashboard). Data tetap tersimpan di database untuk audit trail. Aksi ini tidak bisa di-undo dari UI — perlu owner manual restore via SQL kalau salah hapus.`}
				confirmLabel="Hapus project"
				cancelLabel="Batal"
				variant="destructive"
				onConfirm={handleConfirm}
			/>
		</>
	);
}
