"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
	approveDesign,
	type DesignApprovalContext,
	getDesignApprovalContext,
} from "@/lib/actions/event-design";
import { spotsNeedingOwnDesign } from "@/lib/events/spots";
import { FRAME_SIZE_LABELS, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Gerbang terakhir sebelum cetak.
 *
 * Desainer tidak bisa menandai desain "Approved" tanpa menyatakan ukuran file
 * yang dia buat. Kalau ukurannya beda dengan pesanan — atau pesanannya sendiri
 * masih "menyusul" — ACC ditahan dan dia bisa membetulkan ukuran + paket event
 * langsung dari sini (dia juga owner), tanpa pindah halaman. Perubahannya
 * diumumkan ke grup Telegram.
 *
 * Latar: 8 Agustus 2026 event tercatat 2R, klien pesan 4R, ketahuan di hari-H.
 */

const SIZE_CHOICES = ["2R", "4R", "polaroid"] as const;

export function DesignApproveDialog({
	eventId,
	projectId,
	open,
	onOpenChange,
	onApproved,
}: {
	eventId: string;
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onApproved?: () => void;
}) {
	const [ctx, setCtx] = useState<DesignApprovalContext | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [size, setSize] = useState<string>("");
	/** Event multi-unit: ukuran file desain spot ≥2, {"2": "2R"}. */
	const [spotSizes, setSpotSizes] = useState<Record<string, string>>({});
	const [loading, startLoad] = useTransition();
	const [saving, startSave] = useTransition();

	// Muat konteks tiap kali dibuka — pesanan bisa saja baru diubah owner lain.
	useEffect(() => {
		if (!open) return;
		setCtx(null);
		setSize("");
		setSpotSizes({});
		setLoadError(null);
		startLoad(async () => {
			const res = await getDesignApprovalContext(eventId);
			if (res.error || !res.context) {
				setLoadError(res.error ?? "Gagal memuat data event.");
				return;
			}
			setCtx(res.context);
		});
	}, [open, eventId]);

	const ordered = ctx?.frameSize ?? null;
	const frameIrrelevant = ctx?.frameIrrelevant ?? false;
	const mismatch = Boolean(size) && !frameIrrelevant && ordered !== size;
	const orderTbc = !frameIrrelevant && !ordered;
	const correctionPkg = ctx?.alternatives.find((a) => a.frameSize === size);
	const priceDelta = correctionPkg
		? correctionPkg.basePrice - (ctx?.currentBasePrice ?? 0)
		: 0;
	// Spot yang beda ukuran dari spot 1 (setelah koreksi) → file desain sendiri.
	const ownDesign =
		ctx && !frameIrrelevant
			? spotsNeedingOwnDesign(ctx.spotSource, size || ordered)
			: [];
	const spotsOk = ownDesign.every((o) => spotSizes[String(o.spot)] === o.size);

	function submit(withCorrection: boolean) {
		if (!ctx) return;
		startSave(async () => {
			const res = await approveDesign(
				eventId,
				projectId,
				frameIrrelevant ? "none" : size,
				withCorrection && size
					? { frameSize: size, packageId: correctionPkg?.packageId ?? null }
					: undefined,
				Object.fromEntries(
					ownDesign.map((o) => [
						String(o.spot),
						spotSizes[String(o.spot)] ?? "",
					]),
				),
			);
			if (res.error) {
				toast.error(res.error);
				return;
			}
			toast.success(
				withCorrection
					? `Pesanan dibetulkan jadi ${size} & desain di-ACC`
					: "Desain di-ACC — siap cetak",
			);
			onOpenChange(false);
			onApproved?.();
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>ACC desain — siap cetak?</DialogTitle>
					<DialogDescription>
						{ctx
							? `${ctx.clientName} · kamu gerbang terakhir sebelum file dicetak.`
							: "Memuat data pesanan…"}
					</DialogDescription>
				</DialogHeader>

				{loading && !ctx && (
					<div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" aria-hidden />
						Memuat pesanan klien…
					</div>
				)}

				{loadError && (
					<p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
						{loadError}
					</p>
				)}

				{ctx && (
					<div className="space-y-4">
						{/* Pesanan klien — fakta pembanding, selalu terlihat */}
						<div className="rounded-lg border border-border-default bg-secondary/40 p-3 text-[13px]">
							<p className="eyebrow mb-1">Pesanan klien</p>
							<p className="font-medium">
								{frameIrrelevant
									? "Paket tanpa cetak frame"
									: ordered
										? `Ukuran ${FRAME_SIZE_LABELS[ordered] ?? ordered}${ctx.unitCount > 1 ? " (spot 1)" : ""}`
										: "⚠ Ukuran masih menyusul"}
							</p>
							<p className="text-muted-foreground">
								{ctx.packageName ??
									(ctx.durationHours
										? `${ctx.durationHours} jam · paket belum final`
										: "Custom / tanpa paket")}
								{ctx.unitCount > 1 ? ` · × ${ctx.unitCount} unit` : ""}
							</p>
						</div>

						{!frameIrrelevant && (
							<div className="space-y-2">
								<p className="text-[13px] font-medium">
									{ctx.unitCount > 1
										? "Ukuran file desain spot 1?"
										: "Ukuran file desain yang kamu buat?"}
								</p>
								<div className="flex flex-wrap gap-2">
									{SIZE_CHOICES.map((s) => (
										<button
											key={s}
											type="button"
											onClick={() => setSize(s)}
											aria-pressed={size === s}
											className={cn(
												"h-9 rounded-full border px-4 text-[13px] font-medium transition-colors",
												size === s
													? "border-foreground bg-foreground text-background"
													: "border-border-default bg-card hover:bg-secondary",
											)}
										>
											{FRAME_SIZE_LABELS[s] ?? s}
										</button>
									))}
								</div>
							</div>
						)}

						{/* Event multi-unit: spot beda ukuran → ukuran file per spot */}
						{ownDesign.map((o) => {
							const picked = spotSizes[String(o.spot)];
							return (
								<div key={o.spot} className="space-y-2">
									<p className="text-[13px] font-medium">
										Spot {o.spot} pakai {FRAME_SIZE_LABELS[o.size] ?? o.size} —
										ukuran file desain spot {o.spot}?
									</p>
									<div className="flex flex-wrap gap-2">
										{SIZE_CHOICES.map((sz) => (
											<button
												key={sz}
												type="button"
												onClick={() =>
													setSpotSizes((m) => ({ ...m, [String(o.spot)]: sz }))
												}
												aria-pressed={picked === sz}
												className={cn(
													"h-9 rounded-full border px-4 text-[13px] font-medium transition-colors",
													picked === sz
														? "border-foreground bg-foreground text-background"
														: "border-border-default bg-card hover:bg-secondary",
												)}
											>
												{FRAME_SIZE_LABELS[sz] ?? sz}
											</button>
										))}
									</div>
									{picked && picked !== o.size && (
										<p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[12.5px] text-amber-900 dark:text-amber-200">
											<AlertTriangle className="size-4 shrink-0" aria-hidden />
											Desain spot {o.spot} {picked} ≠ pesanan {o.size}. Perbaiki
											filenya, atau ubah ukuran spot {o.spot} lewat Edit event.
										</p>
									)}
								</div>
							);
						})}

						{/* Cocok → tinggal ACC */}
						{!frameIrrelevant && size && !mismatch && spotsOk && (
							<p className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-[13px] text-emerald-800 dark:text-emerald-300">
								<CheckCircle2 className="size-4 shrink-0" aria-hidden />
								Ukuran desain sama dengan pesanan. Aman dicetak.
							</p>
						)}

						{/* Beda / pesanan masih TBC → tahan, tawarkan koreksi di tempat */}
						{(mismatch || (orderTbc && size)) && (
							<div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[13px] text-amber-900 dark:text-amber-200">
								<p className="flex items-center gap-2 font-medium">
									<AlertTriangle className="size-4 shrink-0" aria-hidden />
									{orderTbc
										? "Pesanan belum punya ukuran"
										: `Desain ${size} ≠ pesanan ${ordered}`}
								</p>
								<p className="text-amber-900/85 dark:text-amber-200/85">
									{orderTbc
										? `Kalau klien memang pesan ${size}, kunci sekarang supaya semua orang (crew, cetak, laporan) lihat angka yang sama.`
										: "Salah satu harus dibetulkan sebelum cetak. Kalau yang salah pesanannya, betulkan dari sini."}
								</p>
								{correctionPkg && (
									<p className="text-amber-900/85 dark:text-amber-200/85">
										Paket jadi <b>{correctionPkg.name}</b> ·{" "}
										{formatRupiah(correctionPkg.basePrice)}
										{priceDelta !== 0
											? ` (harga ${priceDelta > 0 ? "naik" : "turun"} ${formatRupiah(Math.abs(priceDelta))})`
											: " (harga tidak berubah)"}
									</p>
								)}
								{!correctionPkg && ctx.durationHours && (
									<p className="text-amber-900/85 dark:text-amber-200/85">
										Tidak ada paket {ctx.durationHours} jam ukuran {size} di
										pricelist — event hanya diubah ukurannya, paket tetap
										seperti sekarang.
									</p>
								)}
							</div>
						)}

						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
								disabled={saving}
							>
								Batal
							</Button>
							{mismatch || (orderTbc && size) ? (
								<Button
									type="button"
									onClick={() => submit(true)}
									disabled={saving || !spotsOk}
								>
									{saving ? "Menyimpan…" : `Betulkan jadi ${size} & ACC`}
								</Button>
							) : (
								<Button
									type="button"
									onClick={() => submit(false)}
									disabled={saving || (!frameIrrelevant && !size) || !spotsOk}
								>
									{saving ? "Menyimpan…" : "ACC — siap cetak"}
								</Button>
							)}
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
