"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { createAssetCheck } from "@/lib/actions/asset-checks";

export function NewAssetCheckButton() {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	function handleClick() {
		startTransition(async () => {
			const res = await createAssetCheck();
			if (!res.ok) {
				toast.error(res.error);
			} else {
				toast.success(
					res.resumed
						? "Masih ada cek alat yang berjalan — lanjutkan yang ini dulu"
						: "Cek alat dimulai — tandai tiap alat: Ada, Rusak, atau Hilang",
				);
				router.push(`/warehouse/asset-check/${res.id}`);
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
			{pending ? "Membuat..." : "Mulai Cek Alat"}
		</button>
	);
}
