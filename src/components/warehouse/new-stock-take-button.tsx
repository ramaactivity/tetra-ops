"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { buttonVariants } from "@/components/ui/button";
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
				toast.success(
					res.resumed
						? "Masih ada opname yang berjalan — lanjutkan yang ini dulu"
						: "Opname dimulai — hitung jumlah fisik tiap barang",
				);
				router.push(`/warehouse/stock-take/${res.id}`);
			}
		});
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={pending}
			className={buttonVariants({ variant: "default", className: "h-9" })}
		>
			<Plus className="size-4" />
			{pending ? "Membuat..." : "Mulai Opname"}
		</button>
	);
}
