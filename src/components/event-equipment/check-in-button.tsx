"use client";

import { ArrowDownToLine } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { checkInEquipment } from "@/lib/actions/event-equipment";

export function CheckInButton({
	itemId,
	eventId,
	projectId,
	itemName,
}: {
	itemId: string;
	eventId: string;
	projectId: string;
	itemName: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				title="Check-in (kembalikan)"
				className="press-down inline-flex h-8 items-center gap-1 rounded-md border border-emerald-500/30 px-2 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
			>
				<ArrowDownToLine className="size-3.5" />
				Check-in
			</button>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title="Kembalikan ke gudang?"
				description={`"${itemName}" akan di-check-in dari event ini dan kembali ke status available di gudang.`}
				confirmLabel="Check-in"
				onConfirm={async () => {
					const result = await checkInEquipment(itemId, eventId, projectId);
					if (result.error) {
						toast.error(result.error);
						throw new Error(result.error);
					}
					toast.success(`"${itemName}" sudah di-check-in`);
				}}
			/>
		</>
	);
}
