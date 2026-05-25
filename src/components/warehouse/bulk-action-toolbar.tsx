"use client";

import { Archive, EyeOff, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import {
	archiveItemsBulk,
	toggleItemsActiveBulk,
} from "@/lib/actions/items";

/**
 * Floating bulk action toolbar — muncul fixed di bottom-center saat ada
 * item ter-select di Warehouse table. Aksi: Archive (soft-delete),
 * Toggle Inactive, Clear selection.
 */
export function BulkActionToolbar({
	selectedCount,
	selectedIds,
	onClear,
}: {
	selectedCount: number;
	selectedIds: Set<string>;
	onClear: () => void;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	function handleArchive() {
		if (
			!confirm(
				`Archive ${selectedCount} item? Item bisa di-restore lewat database — UI tidak punya undo.`,
			)
		)
			return;
		startTransition(async () => {
			const ids = Array.from(selectedIds);
			const result = await archiveItemsBulk(ids);
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success(`${result.count} item ter-archive`);
			onClear();
			router.refresh();
		});
	}

	function handleSetInactive() {
		startTransition(async () => {
			const ids = Array.from(selectedIds);
			const result = await toggleItemsActiveBulk(ids, false);
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success(`${result.count} item di-nonaktifkan`);
			onClear();
			router.refresh();
		});
	}

	return (
		<div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-3 duration-200">
			<div className="bg-foreground text-background flex items-center gap-1 rounded-xl px-2 py-2 shadow-2xl ring-1 ring-foreground/10">
				<div className="px-2.5 text-sm font-semibold tabular">
					{selectedCount}{" "}
					<span className="font-normal text-background/70">terpilih</span>
				</div>
				<div className="bg-background/15 mx-1 h-6 w-px" />
				<button
					type="button"
					onClick={handleSetInactive}
					disabled={pending}
					className="press-down hover:bg-background/10 inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50"
					title="Tandai nonaktif — sembunyi dari list, bisa diaktifkan lagi nanti"
				>
					<EyeOff className="size-3.5" />
					Nonaktifkan
				</button>
				<button
					type="button"
					onClick={handleArchive}
					disabled={pending}
					className="press-down hover:bg-rose-500/20 inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-rose-300 transition-colors disabled:opacity-50"
					title="Archive permanen — soft delete dengan deleted_at"
				>
					<Archive className="size-3.5" />
					Archive
				</button>
				<div className="bg-background/15 mx-1 h-6 w-px" />
				<button
					type="button"
					onClick={onClear}
					disabled={pending}
					className="press-down hover:bg-background/10 inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
					title="Batal pilih"
					aria-label="Clear selection"
				>
					<X className="size-3.5" />
				</button>
			</div>
		</div>
	);
}
