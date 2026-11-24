"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { tagihkanExtend } from "@/lib/actions/rekap-extend";

/** Satu tap: tambahan jam dari laporan crew → add-on di tagihan klien. */
export function TagihkanExtendButton({
	projectId,
	jam,
	harga,
}: {
	projectId: string;
	jam: number;
	harga: string;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	return (
		<button
			type="button"
			disabled={pending}
			onClick={async () => {
				const ok = await confirm({
					title: `Tagihkan ${jam} jam tambahan?`,
					description: `Add-on Tambahan Durasi ${harga} masuk ke tagihan klien. Invoice ikut diperbarui (nomor sama) lalu ditawarkan ke kamu untuk dikirim — tidak terkirim otomatis.`,
					confirmLabel: "Tagihkan",
				});
				if (!ok) return;
				start(async () => {
					const r = await tagihkanExtend(projectId);
					if (r.ok) {
						toast.success(r.pesan);
						router.refresh();
					} else toast.error(r.error);
				});
			}}
			className="ml-6.5 shrink-0 rounded-full bg-foreground px-3 py-1 text-[12px] font-medium text-background hover:opacity-90 disabled:opacity-60 sm:ml-0"
		>
			{pending ? "Menagihkan…" : `Tagihkan ${jam} jam`}
		</button>
	);
}
