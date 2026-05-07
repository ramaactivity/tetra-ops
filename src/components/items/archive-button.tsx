"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { archiveItem } from "@/lib/actions/items";

export function ArchiveItemButton({ id, name }: { id: string; name: string }) {
	const [pending, startTransition] = useTransition();

	function onClick() {
		const ok = window.confirm(
			`Arsip item "${name}"? Item akan disembunyikan dari list & lookup.`,
		);
		if (!ok) return;
		startTransition(async () => {
			try {
				await archiveItem(id);
			} catch (e) {
				const msg = e instanceof Error ? e.message : "Gagal arsip";
				window.alert(msg);
			}
		});
	}

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={pending}
			title="Arsipkan"
			className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
		>
			<Trash2 className="h-4 w-4" />
		</button>
	);
}
