"use client";

import { Power } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { toggleBackdropActive } from "@/lib/actions/backdrops";

export function ToggleBackdropActiveButton({
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
				title={isActive ? "Nonaktifkan backdrop?" : "Aktifkan backdrop?"}
				description={`Backdrop "${name}" akan ${isActive ? "dinonaktifkan dari katalog" : "diaktifkan kembali"}.`}
				confirmLabel={isActive ? "Nonaktifkan" : "Aktifkan"}
				variant={isActive ? "destructive" : "default"}
				onConfirm={async () => {
					try {
						await toggleBackdropActive(id, !isActive);
						toast.success(
							isActive
								? `Backdrop "${name}" dinonaktifkan`
								: `Backdrop "${name}" diaktifkan`,
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
