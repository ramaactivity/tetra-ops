"use client";

import { Loader2, ScanSearch } from "lucide-react";
import { useState, useTransition } from "react";
import { runAnomalyScanner } from "@/lib/actions/anomaly-scanner";

export function RunScannerButton() {
	const [pending, startTransition] = useTransition();
	const [summary, setSummary] = useState<string | null>(null);

	const handle = () => {
		setSummary(null);
		startTransition(async () => {
			try {
				const r = await runAnomalyScanner();
				const errorPart = r.errors.length ? ` · ${r.errors.length} error` : "";
				setSummary(
					`Scan ${r.scanned} rule, match ${r.matched} entity, bikin ${r.created} notif baru, skip ${r.skipped} (sudah ada).${errorPart}`,
				);
			} catch (err) {
				setSummary(
					`Scan gagal: ${err instanceof Error ? err.message : "unknown"}`,
				);
			}
		});
	};

	return (
		<div className="flex flex-col items-end gap-1">
			<button
				type="button"
				onClick={handle}
				disabled={pending}
				className="border-border-default bg-card text-foreground hover:bg-secondary disabled:opacity-50 inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium"
			>
				{pending ? (
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
				) : (
					<ScanSearch className="h-3.5 w-3.5" />
				)}
				{pending ? "Scanning…" : "Run scan"}
			</button>
			{summary && (
				<p className="text-muted-foreground text-right text-[10px]">
					{summary}
				</p>
			)}
		</div>
	);
}
