"use client";

import { Power } from "lucide-react";
import { useTransition } from "react";
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
	const [pending, startTransition] = useTransition();

	function onClick() {
		const action = isActive ? "menonaktifkan" : "mengaktifkan";
		const ok = window.confirm(`${action} backdrop "${name}"?`);
		if (!ok) return;
		startTransition(async () => {
			try {
				await toggleBackdropActive(id, !isActive);
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
			title={isActive ? "Nonaktifkan" : "Aktifkan"}
			className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
		>
			<Power className="h-4 w-4" />
		</button>
	);
}
