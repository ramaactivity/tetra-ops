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
				toast.success("Stock take dimulai — fill counted qty per item");
				router.push(`/warehouse/stock-take/${res.id}`);
			}
		});
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={pending}
			className="press-down inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
		>
			<Plus className="size-4" />
			{pending ? "Membuat..." : "Stock Take Baru"}
		</button>
	);
}
