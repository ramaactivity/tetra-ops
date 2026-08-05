"use client";

import { AlertTriangle, BellRing, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/toaster";
import { remindOwnerIncompleteData } from "@/lib/actions/nudge-owner";

/**
 * Panel di detail event crew: apa yang masih belum pasti + tombol mengingatkan
 * owner.
 *
 * Crew biasanya yang paling dulu sadar ada yang janggal ("besok saya ke
 * mana?"), sementara reminder otomatis cuma berbunyi H-7 dan H-3. Tombol ini
 * menutup celah di antaranya, dan ingatannya tercatat di inbox notifikasi
 * owner — bukan chat grup yang gampang tenggelam.
 */
export function TbcNudgePanel({
	projectId,
	missing,
}: {
	projectId: string;
	missing: string[];
}) {
	const [pending, setPending] = useState(false);
	const [sent, setSent] = useState(false);

	if (missing.length === 0) return null;

	async function nudge() {
		setPending(true);
		const res = await remindOwnerIncompleteData(projectId);
		setPending(false);
		if (!res.ok) {
			toast.error(res.error);
			return;
		}
		setSent(true);
		toast.success("Owner sudah diingatkan 🔔");
	}

	return (
		<section className="rounded-[16px] border border-amber-300/60 bg-amber-50/60 p-4 shadow-[var(--shadow-level-2)] dark:border-amber-900/70 dark:bg-amber-950/20">
			<div className="flex items-start gap-2">
				<AlertTriangle
					className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
					aria-hidden
				/>
				<div className="min-w-0 flex-1">
					<p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
						Data belum lengkap
					</p>
					<p className="mt-0.5 text-[12.5px] text-amber-900/80 dark:text-amber-200/80">
						Belum ditentukan:{" "}
						<span className="font-medium">{missing.join(", ")}</span>.
					</p>
				</div>
			</div>

			<button
				type="button"
				onClick={nudge}
				disabled={pending || sent}
				className="press tap mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-amber-400/70 bg-white/70 text-[13px] font-medium text-amber-900 transition-colors hover:bg-white disabled:opacity-60 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
			>
				{pending ? (
					<>
						<Loader2 className="size-3.5 animate-spin" aria-hidden />
						Mengirim…
					</>
				) : sent ? (
					"Owner sudah diingatkan ✓"
				) : (
					<>
						<BellRing className="size-3.5" aria-hidden />
						Ingatkan owner
					</>
				)}
			</button>
		</section>
	);
}
