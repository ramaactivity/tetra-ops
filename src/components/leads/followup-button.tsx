"use client";

import {
	Ban,
	CheckCheck,
	Loader2,
	MessageSquareReply,
	Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { toast } from "@/components/ui/toaster";
import {
	batalFollowup,
	cekFollowup,
	kirimFollowup,
	mintaFollowup,
} from "@/lib/actions/followup";
import { timeAgo } from "@/lib/dates";
import {
	FOLLOWUP_JEDA_JAM,
	type FollowupState,
} from "@/lib/leads/followup-types";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;

/** Pesan Hermes saat menolak/gagal — tanpa label "[DIAM]" & kurung kosong. */
function gagalText(hasil: string | null | undefined): string {
	const bersih = (hasil ?? "")
		.replace(/\[DIAM\]:?/g, "")
		.replace(/\(\s*\)/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\.$/, "");
	if (hasil?.includes("[DIAM]"))
		return `${bersih || "Hermes menilai belum perlu menghubungi kontak ini sekarang"}. Kalau tetap perlu, minta draf lagi atau chat langsung.`;
	return `Belum bisa: ${bersih || "tanpa keterangan"}`;
}
/** Setelah ini berhenti menunggu di dialog; status tetap tersimpan di tombol. */
const DRAF_SABAR_MS = 90_000;

/**
 * Follow-up sekali klik: minta draf ke Hermes (lewat bot) → periksa/ubah →
 * Kirim. Klik Kirim = izin untuk pesan ini saja (aturan sejak insiden 6 Okt).
 */
export function FollowupButton({
	jid,
	nomor,
	nama,
	alasan,
	konteks,
	latest,
	compact = false,
	blokir = null,
}: {
	jid: string | null;
	nomor: string;
	nama: string;
	/** Fakta singkat untuk Hermes, mis. "quotation QUO-… terkirim 2 hari lalu". */
	alasan: string;
	/** Data pendukung (acara terakhir, PIC, dokumen) — maks ±800 karakter. */
	konteks?: string | null;
	/** Permintaan terakhir ke nomor ini (30 hari). */
	latest: FollowupState | null;
	compact?: boolean;
	/** Prospek berstatus tolak/jangan_hubungi/berhenti → tombol mati + alasannya. */
	blokir?: string | null;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [state, setState] = useState<FollowupState | null>(latest);
	const [pesan, setPesan] = useState(latest?.draf ?? "");
	const [pending, start] = useTransition();
	const [lama, setLama] = useState(false);
	const startedAt = useRef(0);

	const status = state?.status;
	const jedaAktif =
		status === "terkirim" &&
		Date.now() - new Date(state?.updatedAt ?? 0).getTime() <
			FOLLOWUP_JEDA_JAM * 3_600_000;
	const polling = open && (status === "menunggu_draf" || status === "mengirim");

	useEffect(() => {
		if (!polling || !state) return;
		startedAt.current ||= Date.now();
		const t = setInterval(async () => {
			const res = await cekFollowup(state.id);
			if (!res.ok) return;
			if (res.state.status !== state.status) {
				setState(res.state);
				if (res.state.status === "draf") setPesan(res.state.draf ?? "");
				if (res.state.status === "terkirim") {
					toast.success(`Follow-up terkirim ke ${nama}`);
					router.refresh();
				}
				startedAt.current = 0;
				setLama(false);
			} else if (Date.now() - startedAt.current > DRAF_SABAR_MS) setLama(true);
		}, POLL_MS);
		return () => clearInterval(t);
	}, [polling, state, nama, router]);

	function mulai() {
		// Draf/antrean yang sudah ada → buka saja, jangan minta ulang.
		if (
			status === "draf" ||
			status === "menunggu_draf" ||
			status === "mengirim"
		) {
			setOpen(true);
			return;
		}
		start(async () => {
			const res = await mintaFollowup({ jid, nomor, alasan, konteks });
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			setState(res.state);
			setPesan(res.state.draf ?? "");
			startedAt.current = Date.now();
			setLama(false);
			setOpen(true);
		});
	}

	function kirim() {
		if (!state) return;
		start(async () => {
			const res = await kirimFollowup(state.id, pesan);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			startedAt.current = Date.now();
			setState(res.state);
		});
	}

	function batal() {
		if (!state) return;
		start(async () => {
			const res = await batalFollowup(state.id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			setState({ ...state, status: "batal" });
			setOpen(false);
			router.refresh();
		});
	}

	if (blokir)
		return (
			<span
				title={`Tidak di-follow-up lagi: ${blokir}`}
				className="inline-flex items-center gap-1 whitespace-nowrap px-2 text-[12px] font-medium text-muted-foreground"
			>
				<Ban className="size-3.5" aria-hidden />
				{blokir.startsWith("berhenti") ? "Berhenti" : "Jangan dihubungi"}
			</span>
		);

	if (jedaAktif)
		return (
			<span
				title={`Di-follow-up ${timeAgo(state?.updatedAt ?? "")}${state?.pesan ? `: ${state.pesan}` : ""}`}
				className="inline-flex items-center gap-1 whitespace-nowrap px-2 text-[12px] font-medium text-emerald-700 dark:text-emerald-400"
			>
				<CheckCheck className="size-3.5" aria-hidden />
				Di-follow-up
			</span>
		);

	const label =
		status === "draf"
			? "Draf siap"
			: status === "menunggu_draf"
				? "Menunggu draf"
				: status === "mengirim"
					? "Antre kirim"
					: "Follow-up";

	return (
		<>
			<button
				type="button"
				onClick={mulai}
				disabled={pending}
				title={status === "gagal" && state?.hasil ? state.hasil : undefined}
				className={cn(
					"press-down inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-medium transition-colors disabled:opacity-60",
					status === "draf"
						? "bg-[#059669] text-white hover:bg-[#047857]"
						: "text-foreground/80 hover:bg-surface-3 hover:text-foreground",
					compact && "px-2",
				)}
			>
				{pending ? (
					<Loader2 className="size-3.5 animate-spin" aria-hidden />
				) : (
					<MessageSquareReply className="size-3.5" aria-hidden />
				)}
				{label}
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Follow-up {nama}</DialogTitle>
						<DialogDescription>{alasan}</DialogDescription>
					</DialogHeader>

					{status === "menunggu_draf" ? (
						<p className="flex items-start gap-2 rounded-2xl bg-secondary px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
							<Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
							{lama
								? "Draf belum datang — bot mungkin sedang sibuk atau offline. Tutup saja; begitu draf siap, tombolnya berubah jadi “Draf siap”."
								: "Hermes sedang menulis draf dari riwayat chat. Biasanya 10–20 detik."}
						</p>
					) : status === "draf" ? (
						<div className="space-y-1.5">
							<span className="text-[13px] font-medium">
								Draf dari Hermes — boleh diubah sebelum dikirim
							</span>
							<RichTextarea
								value={pesan}
								onChange={setPesan}
								rows={7}
								maxLength={1500}
							/>
						</div>
					) : status === "mengirim" ? (
						<p className="flex items-start gap-2 rounded-2xl bg-secondary px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
							<Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
							{lama
								? "Masih antre di bot. Bot hanya mengirim jam 08–20 WIB dan ada kuota harian, jadi pesan ini terkirim begitu jendelanya buka. Aman ditutup."
								: "Bot sedang mengirim pesan…"}
						</p>
					) : status === "terkirim" ? (
						<p className="flex items-start gap-2 rounded-2xl bg-emerald-500/10 px-3.5 py-3 text-[13px] leading-relaxed text-emerald-800 dark:text-emerald-300">
							<CheckCheck className="mt-0.5 size-4 shrink-0" />
							Terkirim. {state?.hasil ?? ""}
						</p>
					) : status === "gagal" ? (
						<p className="rounded-2xl bg-secondary px-3.5 py-3 text-[13px] leading-relaxed text-foreground/80">
							{gagalText(state?.hasil)}
						</p>
					) : null}

					<DialogFooter>
						{status === "draf" ? (
							<>
								<Button variant="ghost" onClick={batal} disabled={pending}>
									Batal
								</Button>
								<Button
									onClick={kirim}
									disabled={pending || pesan.trim().length < 10}
								>
									{pending ? <Loader2 className="animate-spin" /> : <Send />}
									Kirim
								</Button>
							</>
						) : status === "menunggu_draf" ? (
							<>
								<Button variant="ghost" onClick={batal} disabled={pending}>
									Batalkan permintaan
								</Button>
								<Button variant="outline" onClick={() => setOpen(false)}>
									Tutup
								</Button>
							</>
						) : status === "gagal" ? (
							<>
								<Button variant="ghost" onClick={() => setOpen(false)}>
									Tutup
								</Button>
								<Button onClick={mulai} disabled={pending}>
									{pending ? (
										<Loader2 className="animate-spin" />
									) : (
										<MessageSquareReply />
									)}
									Minta draf lagi
								</Button>
							</>
						) : (
							<Button variant="outline" onClick={() => setOpen(false)}>
								Tutup
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
