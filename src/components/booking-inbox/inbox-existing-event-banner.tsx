"use client";

import { CalendarCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
	cancelInbox,
	gabungkanInboxKeEvent,
} from "@/lib/actions/booking-inbox";

/**
 * Kartu dari bot untuk klien yang sudah punya acara mendatang (nomor cocok,
 * aturan cocokNomor). Biasanya bot salah mengira bukti pelunasan sebagai
 * booking baru (Shella 25 Nov) → Gabungkan ke event itu, atau Batalkan kalau
 * memang dobel. Tidak ada yang dihapus.
 */
export function InboxExistingEventBanner({
	inboxId,
	events,
}: {
	inboxId: string;
	events: Array<{ id: string; project_id: string; label: string }>;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();

	async function gabung(e: (typeof events)[number]) {
		const ok = await confirm({
			title: `Gabungkan ke ${e.project_id}?`,
			description: `Kartu ini ditandai jadi event ${e.label}. Bukti transfernya ikut ke event itu dan bisa dikonfirmasi ke tagihannya.`,
			confirmLabel: "Gabungkan",
		});
		if (!ok) return;
		start(async () => {
			const r = await gabungkanInboxKeEvent(inboxId, e.id);
			if (!r.ok) return void toast.error(r.error);
			toast.success(`Digabung ke ${e.project_id}`);
			router.refresh();
		});
	}

	async function batal() {
		const ok = await confirm({
			title: "Batalkan kartu ini?",
			description:
				"Kartu tetap tersimpan sebagai jejak. Bukti transfer di kartu ini tidak ikut dibatalkan — tangani di Uang Masuk.",
			confirmLabel: "Batalkan kartu",
			variant: "destructive",
		});
		if (!ok) return;
		start(async () => {
			const r = await cancelInbox(inboxId);
			if (!r.ok) return void toast.error(r.error);
			toast.success("Kartu dibatalkan");
			router.refresh();
		});
	}

	return (
		<div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-[13px] dark:border-sky-900/60 dark:bg-sky-950/20">
			<p className="flex items-start gap-2 font-medium text-foreground">
				<CalendarCheck
					className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400"
					aria-hidden
				/>
				<span>
					Klien sudah punya event{" "}
					{events.map((e, i) => (
						<span key={e.id}>
							{i > 0 ? ", " : ""}
							<Link
								href={`/operations/${e.project_id}`}
								className="underline underline-offset-2"
							>
								{e.project_id}
							</Link>
						</span>
					))}
				</span>
			</p>
			<p className="ml-6 text-[12.5px] text-muted-foreground">
				Kartu ini mungkin bukan booking baru — misalnya bukti pelunasan yang
				terbaca sebagai DP.
			</p>
			<div className="ml-6 flex flex-wrap gap-1.5">
				{events.map((e) => (
					<Button
						key={e.id}
						size="sm"
						className="rounded-full"
						disabled={pending}
						onClick={() => gabung(e)}
					>
						{pending ? <Loader2 className="animate-spin" /> : null}
						Gabungkan ke {e.project_id}
					</Button>
				))}
				<Button
					size="sm"
					variant="outline"
					className="rounded-full"
					disabled={pending}
					onClick={batal}
				>
					Batalkan kartu
				</Button>
			</div>
		</div>
	);
}
