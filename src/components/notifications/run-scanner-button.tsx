"use client";

import { Loader2, ScanSearch } from "lucide-react";
import { useTransition } from "react";
import { toast } from "@/components/ui/toaster";
import { runAnomalyScanner } from "@/lib/actions/anomaly-scanner";

export function RunScannerButton() {
	const [pending, startTransition] = useTransition();

	const handle = () => {
		startTransition(async () => {
			try {
				const r = await runAnomalyScanner();
				const msg = `Selesai: ${r.created} baru, ${r.resolved} yang sudah beres ditutup.`;
				if (r.errors.length)
					toast.error(`${msg} ${r.errors.length} pengecekan gagal.`);
				else toast.success(msg);
			} catch (err) {
				toast.error(
					`Gagal mengecek: ${err instanceof Error ? err.message : "unknown"}`,
				);
			}
		});
	};

	return (
		<button
			type="button"
			onClick={handle}
			disabled={pending}
			aria-label="Cek ulang"
			title="Cek ulang notifikasi"
			className="border-border-default bg-card text-foreground hover:bg-secondary disabled:opacity-50 inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium"
		>
			{pending ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
			) : (
				<ScanSearch className="h-3.5 w-3.5" />
			)}
			<span className="hidden sm:inline">
				{pending ? "Mengecek…" : "Cek ulang"}
			</span>
		</button>
	);
}
