"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import { createStockTake } from "@/lib/actions/stock-takes";

export function NewStockTakeButton() {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	function handleClick() {
		startTransition(async () => {
			const fd = new FormData();
			fd.set("notes", "");
			const res = await createStockTake(fd);
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success("Opname dimulai — hitung fisik per item");
				router.push(`/warehouse/stock-take/${res.id}`);
			}
		});
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={pending}
			className="press-down inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary dark:bg-primary px-3 text-fluid-caption font-medium text-white hover:bg-primary/90 dark:hover:bg-primary disabled:opacity-50"
		>
			<Plus className="size-4" />
			{pending ? "Membuat..." : "Mulai Opname"}
		</button>
	);
}
