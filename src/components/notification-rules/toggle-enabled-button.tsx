"use client";

import { Power } from "lucide-react";
import { useTransition } from "react";
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
	const [pending, startTransition] = useTransition();

	function onClick() {
		const action = isEnabled ? "menonaktifkan" : "mengaktifkan";
		const ok = window.confirm(`${action} rule "${name}"?`);
		if (!ok) return;
		startTransition(async () => {
			try {
				await toggleNotificationRuleEnabled(id, !isEnabled);
			} catch (e) {
				const msg = e instanceof Error ? e.message : "Gagal toggle";
				window.alert(msg);
			}
		});
	}

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={pending}
			title={isEnabled ? "Nonaktifkan" : "Aktifkan"}
			className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
		>
			<Power className="h-4 w-4" />
		</button>
	);
}
