"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { archiveItem } from "@/lib/actions/items";

export function ArchiveItemButton({ id, name }: { id: string; name: string }) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				title="Arsipkan"
				aria-label={`Arsipkan ${name}`}
				className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
			>
				<Trash2 className="size-4" />
			</button>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title="Arsipkan item?"
				description={`Item "${name}" akan disembunyikan dari list & lookup. Bisa dibuka lagi via filter "Show archived".`}
				confirmLabel="Arsipkan"
				variant="destructive"
				onConfirm={async () => {
					try {
						await archiveItem(id);
						toast.success(`Item "${name}" diarsipkan`);
					} catch (e) {
						const msg = e instanceof Error ? e.message : "Gagal arsip";
						toast.error(msg);
						throw e;
					}
				}}
			/>
		</>
	);
}
