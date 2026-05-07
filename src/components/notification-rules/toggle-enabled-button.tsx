"use client";

import { Power } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { toggleNotificationRuleEnabled } from "@/lib/actions/notification-rules";

export function ToggleRuleEnabledButton({
	id,
	isEnabled,
	name,
}: {
	id: string;
	isEnabled: boolean;
	name: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				title={isEnabled ? "Nonaktifkan" : "Aktifkan"}
				className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
			>
				<Power className="size-4" />
			</button>
			<ConfirmDialog
				open={open}
				onOpenChange={setOpen}
				title={isEnabled ? "Nonaktifkan rule?" : "Aktifkan rule?"}
				description={`Rule "${name}" akan ${isEnabled ? "berhenti dijalankan oleh anomaly scanner" : "mulai aktif lagi"}.`}
				confirmLabel={isEnabled ? "Nonaktifkan" : "Aktifkan"}
				variant={isEnabled ? "destructive" : "default"}
				onConfirm={async () => {
					try {
						await toggleNotificationRuleEnabled(id, !isEnabled);
						toast.success(
							isEnabled
								? `Rule "${name}" dinonaktifkan`
								: `Rule "${name}" diaktifkan`,
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
