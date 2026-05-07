"use client";

import { Power } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { toggleWhatsAppTemplateActive } from "@/lib/actions/whatsapp-templates";

export function ToggleTemplateActiveButton({
	id,
	isActive,
	name,
}: {
	id: string;
	isActive: boolean;
	name: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				title={isActive ? "Nonaktifkan" : "Aktifkan"}
				className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
			>
				<Power className="size-4" />
			</button>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title={isActive ? "Nonaktifkan template?" : "Aktifkan template?"}
				description={`Template "${name}" akan ${isActive ? "tidak muncul di pilihan WhatsApp send" : "kembali tersedia di WhatsApp send"}.`}
				confirmLabel={isActive ? "Nonaktifkan" : "Aktifkan"}
				variant={isActive ? "destructive" : "default"}
				onConfirm={async () => {
					try {
						await toggleWhatsAppTemplateActive(id, !isActive);
						toast.success(
							isActive
								? `Template "${name}" dinonaktifkan`
								: `Template "${name}" diaktifkan`,
						);
					} catch (e) {
						const msg = e instanceof Error ? e.message : "Gagal toggle";
						toast.error(msg);
						throw e;
					}
				}}
			/>
		</>
	);
}
