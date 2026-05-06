"use client";

import { Archive } from "lucide-react";
import { useTransition } from "react";
import { archivePackage } from "@/lib/actions/packages";

export function ArchivePackageButton({
	id,
	name,
}: {
	id: string;
	name: string;
}) {
	const [pending, startTransition] = useTransition();

	function handleArchive() {
		if (
			!confirm(
				`Archive package "${name}"? Paket arsip tidak muncul di booking baru, tapi data lama tetap aman.`,
			)
		) {
			return;
		}
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
