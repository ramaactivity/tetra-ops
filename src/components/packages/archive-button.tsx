"use client";

import { Archive } from "lucide-react";
import { useTransition } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { archivePackage } from "@/lib/actions/packages";

export function ArchivePackageButton({
	id,
	name,
}: {
	id: string;
	name: string;
}) {
	const [pending, startTransition] = useTransition();
	const confirm = useConfirm();

	async function handleArchive() {
		const ok = await confirm({
			title: `Arsipkan paket "${name}"?`,
			description:
				"Paket arsip tidak muncul di booking baru, tapi data lama tetap aman.",
			confirmLabel: "Arsipkan",
		});
		if (!ok) return;
		startTransition(async () => {
			await archivePackage(id);
		});
	}

	return (
		<button
			type="button"
			onClick={handleArchive}
			disabled={pending}
			title="Archive"
			className="text-muted-foreground hover:bg-muted hover:text-destructive inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
		>
			<Archive className="h-4 w-4" />
		</button>
	);
}
