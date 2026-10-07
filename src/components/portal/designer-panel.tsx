"use client";

import { Loader2, Play, Send, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
	addDesignVersion,
	adminCommentDesign,
	requestVersionUpload,
	startDesignWork,
} from "@/lib/actions/design-admin";
import {
	checkDesignFile,
	FRAME_SIZES,
	type FrameSize,
} from "@/lib/portal/design";
import type { DesignRequestView } from "@/lib/portal/design-server";

/** Baca ukuran + cek ada piksel transparan (alpha < 128) di browser. */
async function inspectPng(
	file: File,
): Promise<{ width: number; height: number; transparent: boolean }> {
	const bmp = await createImageBitmap(file);
	const scale = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
	const c = document.createElement("canvas");
	c.width = Math.max(1, Math.round(bmp.width * scale));
	c.height = Math.max(1, Math.round(bmp.height * scale));
	const ctx = c.getContext("2d");
	if (!ctx) return { width: bmp.width, height: bmp.height, transparent: false };
	ctx.drawImage(bmp, 0, 0, c.width, c.height);
	const px = ctx.getImageData(0, 0, c.width, c.height).data;
	let clear = 0;
	for (let i = 3; i < px.length; i += 4) if (px[i] < 128) clear++;
	// Minimal ±1% area transparan dianggap ada kotak foto.
	return {
		width: bmp.width,
		height: bmp.height,
		transparent: clear > (px.length / 4) * 0.01,
	};
}

/** Panel designer per permintaan: upload versi, komentar, mulai kerjakan. */
export function DesignerPanel({ r }: { r: DesignRequestView }) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [frame, setFrame] = useState<FrameSize>((r.size as FrameSize) ?? "4R");
	const [note, setNote] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [warn, setWarn] = useState<string | null>(null);
	const [comment, setComment] = useState("");
	const [busy, setBusy] = useState(false);

	async function pick(f: File | null) {
		setFile(f);
		setWarn(null);
		if (!f) return;
		if (f.type !== "image/png") return setWarn("File harus PNG.");
		const info = await inspectPng(f);
		const check = checkDesignFile(frame, info.width, info.height);
		if (!check.ok) return setWarn(check.error);
		if (!info.transparent)
			setWarn(
				"Tidak ada area transparan. Boleh diunggah (Booth bisa memakai kotak foto warna polos/chroma key), tapi pastikan memang disengaja.",
			);
	}

	async function upload() {
		if (!file) return;
		setBusy(true);
		try {
			const info = await inspectPng(file);
			const check = checkDesignFile(frame, info.width, info.height);
			if (!check.ok) throw new Error(check.error);
			const up = await requestVersionUpload(r.id, file.size);
			if (!up.ok) throw new Error(up.error);
			const put = await fetch(up.uploadUrl, {
				method: "PUT",
				body: file,
				headers: { "content-type": "image/png" },
			});
			if (!put.ok) throw new Error("Upload gagal. Coba lagi.");
			const res = await addDesignVersion(r.id, {
				path: up.path,
				frameSize: frame,
				note,
				hasTransparency: info.transparent,
			});
			if (!res.ok) throw new Error(res.error);
			toast.success("Versi baru terkirim · klien dikabari lewat WA");
			setFile(null);
			setNote("");
			router.refresh();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Gagal mengunggah");
		}
		setBusy(false);
	}

	return (
		<div className="space-y-3">
			{r.stage === "brief" && (
				<Button
					variant="outline"
					size="sm"
					disabled={pending}
					onClick={() =>
						start(async () => {
							const res = await startDesignWork(r.id);
							if (!res.ok) toast.error(res.error);
							else router.refresh();
						})
					}
				>
					<Play /> Mulai kerjakan (brief lewat WA)
				</Button>
			)}
			{r.stage !== "acc" && (
				<div className="space-y-2 rounded-[12px] border border-dashed border-border-default p-3">
					<p className="text-[13px] font-medium">
						Upload versi {r.versions.length + 1}
					</p>
					<div className="flex flex-wrap gap-1.5">
						{FRAME_SIZES.map((f) => (
							<button
								key={f}
								type="button"
								onClick={() => {
									setFrame(f);
									if (file) pick(file);
								}}
								className={`h-8 rounded-full border px-3 text-[13px] ${frame === f ? "border-foreground bg-foreground text-background" : "border-border-subtle"}`}
							>
								{f}
								{r.size === f ? " · pesanan" : ""}
							</button>
						))}
					</div>
					{r.size && frame !== r.size && (
						<p className="text-[12.5px] text-amber-700">
							Pesanan klien {r.size}. ACC nanti tertahan kalau ukurannya beda.
						</p>
					)}
					<label className="flex cursor-pointer items-center gap-2 text-[13px]">
						<Upload className="size-4" />
						<span className="underline">
							{file ? file.name : "Pilih PNG overlay (maks 25 MB)"}
						</span>
						<input
							type="file"
							accept="image/png"
							className="sr-only"
							onChange={(e) => pick(e.target.files?.[0] ?? null)}
						/>
					</label>
					{warn && <p className="text-[12.5px] text-amber-700">{warn}</p>}
					<input
						className="h-9 w-full rounded-full border border-border-subtle bg-card px-4 text-[13px]"
						placeholder="Catatan untuk klien (opsional)"
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
					<Button
						size="sm"
						disabled={busy || !file || warn === "File harus PNG."}
						onClick={upload}
					>
						{busy ? <Loader2 className="animate-spin" /> : <Upload />} Kirim ke
						klien
					</Button>
				</div>
			)}
			<div className="flex gap-2">
				<input
					className="h-9 flex-1 rounded-full border border-border-subtle bg-card px-4 text-[13px]"
					placeholder="Balas komentar klien"
					value={comment}
					onChange={(e) => setComment(e.target.value)}
				/>
				<Button
					size="sm"
					variant="outline"
					disabled={pending || !comment.trim()}
					onClick={() =>
						start(async () => {
							const res = await adminCommentDesign(r.id, comment);
							if (!res.ok) toast.error(res.error);
							else {
								setComment("");
								router.refresh();
							}
						})
					}
				>
					<Send /> Kirim
				</Button>
			</div>
		</div>
	);
}
