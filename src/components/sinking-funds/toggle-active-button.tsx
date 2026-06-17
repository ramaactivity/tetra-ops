"use client";

import { Power } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { toggleSinkingFundActive } from "@/lib/actions/sinking-funds";

export function ToggleActiveButton({
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
				className="press-down inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
			>
				<Power className="size-4" />
			</button>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title={isActive ? "Nonaktifkan fund?" : "Aktifkan fund?"}
				description={`Sinking fund "${name}" akan ${isActive ? "dinonaktifkan — alokasi otomatis berhenti" : "diaktifkan kembali"}.`}
				confirmLabel={isActive ? "Nonaktifkan" : "Aktifkan"}
				variant={isActive ? "destructive" : "default"}
				onConfirm={async () => {
					try {
						await toggleSinkingFundActive(id, !isActive);
						toast.success(
							isActive
								? `Fund "${name}" dinonaktifkan`
								: `Fund "${name}" diaktifkan`,
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
