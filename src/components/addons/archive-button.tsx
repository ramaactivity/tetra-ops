"use client";

import { Archive } from "lucide-react";
import { useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { archiveAddon } from "@/lib/actions/addons";

export function ArchiveAddonButton({ id, name }: { id: string; name: string }) {
	const [pending, startTransition] = useTransition();
	const confirm = useConfirm();

	async function handleArchive() {
		const ok = await confirm({
			title: `Arsipkan add-on "${name}"?`,
			confirmLabel: "Arsipkan",
		});
		if (!ok) return;
		startTransition(async () => {
			await archiveAddon(id);
		});
	}

	return (
		<button
			type="button"
			onClick={handleArchive}
			disabled={pending}
			title="Archive"
			className="text-muted-foreground hover:bg-secondary hover:text-destructive inline-flex size-8 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
		>
			<Archive className="size-4" />
		</button>
	);
}
