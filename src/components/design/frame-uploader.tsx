"use client";

import { CheckCircle2, Loader2, Pipette, Upload, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	createDesignTemplate,
	requestTemplatePreviewUpload,
} from "@/lib/actions/design-admin";
import { DEFAULT_TOLERANCE } from "@/lib/design/chroma";
import { toPngBlob } from "@/lib/design/process-frame";
import { cn } from "@/lib/utils";
import { useFrame } from "./use-frame";

const checker =
	"repeating-conic-gradient(#efede8 0% 25%, #fff 0% 50%) 50% / 14px 14px";

/** Tambah template PNG manual: chroma key + deteksi slot + validasi ukuran. */
export function FrameUploader({
	themes,
	onDone,
}: {
	themes: string[];
	onDone: () => void;
}) {
	const f = useFrame(520);
	const [name, setName] = useState("");
	const [category, setCategory] = useState("");
	const [saving, setSaving] = useState(false);
	const r = f.result;

	async function save() {
		if (!r || r.error || !r.frameSize) return;
		setSaving(true);
		try {
			const blob = await toPngBlob(r);
			const up = await requestTemplatePreviewUpload({
				type: "image/png",
				size: blob.size,
			});
			if (!up.ok) throw new Error(up.error);
			const put = await fetch(up.uploadUrl, {
				method: "PUT",
				body: blob,
				headers: { "content-type": "image/png" },
			});
			if (!put.ok) throw new Error("Upload gagal. Cek koneksi lalu coba lagi.");
			const res = await createDesignTemplate({
				name: name.trim(),
				category,
				frameSize: r.frameSize,
				orientation: r.orientation,
				previewPath: up.path,
				textMode: "baked",
				slotCount: r.slots.length,
			});
			if (!res.ok) throw new Error(res.error);
			toast.success("Template ditambahkan");
			onDone();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
		}
		setSaving(false);
	}

	if (!f.src)
		return (
			<label
				className={cn(
					"border-border-default hover:bg-secondary/50 grid cursor-pointer place-items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center",
					f.busy && "pointer-events-none opacity-60",
				)}
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					const file = e.dataTransfer.files?.[0];
					if (file) f.load(file);
				}}
			>
				{f.busy ? (
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				) : (
					<Upload className="size-6 text-muted-foreground" />
				)}
				<span className="text-[14px] font-semibold">
					Tarik PNG ke sini atau klik untuk memilih
				</span>
				<span className="type-caption text-muted-foreground max-w-sm">
					4R 1200×1800 (atau kelipatannya), 2R strip 600×1800, polaroid
					900×1200. Maks 25 MB.
				</span>
				{f.loadError && (
					<span className="text-destructive text-[13px] font-medium">
						{f.loadError}
					</span>
				)}
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp"
					className="sr-only"
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) f.load(file);
						e.target.value = "";
					}}
				/>
			</label>
		);

	return (
		<div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<div className="space-y-2">
				<div
					className="grid place-items-center overflow-hidden rounded-xl p-3"
					style={{ background: checker }}
				>
					<canvas
						ref={f.canvasRef}
						onClick={f.pickAt}
						title="Klik warna kotak foto untuk menjadikannya transparan"
						className="max-h-[52dvh] w-auto max-w-full cursor-crosshair rounded-md shadow-sm"
					/>
				</div>
				<p className="type-caption text-muted-foreground flex items-center gap-1.5">
					<Pipette className="size-3.5 shrink-0" /> Klik warna kotak foto di
					pratinjau kalau ada yang belum transparan.
				</p>
			</div>

			<div className="min-w-0 space-y-4">
				{r && (
					<div
						className={cn(
							"rounded-xl p-3 text-[13px]",
							r.error
								? "bg-rose-500/10 text-rose-800"
								: "bg-emerald-500/10 text-emerald-800",
						)}
					>
						<p className="flex items-center gap-1.5 font-semibold">
							{f.busy ? (
								<Loader2 className="size-4 shrink-0 animate-spin" />
							) : r.error ? null : (
								<CheckCircle2 className="size-4 shrink-0" />
							)}
							{r.error
								? "Belum bisa dipakai"
								: `${r.frameSize} ${r.orientation === "landscape" ? "landscape" : "portrait"} · ${r.slots.length} kotak foto`}
						</p>
						<p className="mt-0.5">
							{r.error ?? `${r.width}×${r.height} px — siap disimpan.`}
						</p>
						{r.warnings.map((w) => (
							<p key={w} className="mt-1 text-amber-800">
								{w}
							</p>
						))}
					</div>
				)}

				<div className="space-y-2 rounded-xl border border-border-default p-3">
					<div className="flex items-center justify-between gap-2">
						<p className="flex items-center gap-1.5 text-[13px] font-semibold">
							<Wand2 className="size-4 shrink-0" /> Hapus warna kotak foto
						</p>
						<button
							type="button"
							onClick={() =>
								f.setKey(
									f.key
										? null
										: {
												color: f.src?.suggested ?? "#00ff00",
												tolerance: DEFAULT_TOLERANCE,
											},
								)
							}
							className="text-[12.5px] font-medium underline"
						>
							{f.key ? "Matikan" : "Nyalakan"}
						</button>
					</div>
					{f.key ? (
						<>
							<div className="flex items-center gap-2">
								<input
									type="color"
									value={f.key.color}
									aria-label="Warna penanda"
									onChange={(e) =>
										f.setKey({
											color: e.target.value,
											tolerance: f.key?.tolerance ?? DEFAULT_TOLERANCE,
										})
									}
									className="size-9 shrink-0 cursor-pointer rounded-lg border border-border-default"
								/>
								<span className="font-mono text-[12.5px]">{f.key.color}</span>
								<button
									type="button"
									onClick={() => f.setKey(undefined)}
									className="border-border-default hover:bg-secondary ml-auto h-8 rounded-full border px-3 text-[12px] font-medium"
								>
									Deteksi otomatis
								</button>
							</div>
							<label className="block space-y-1">
								<span className="type-caption text-muted-foreground">
									Toleransi warna: {f.key.tolerance}
								</span>
								<input
									type="range"
									min={2}
									max={40}
									value={f.key.tolerance}
									onChange={(e) =>
										f.setKey({
											color: f.key?.color ?? "#00ff00",
											tolerance: Number(e.target.value),
										})
									}
									className="w-full accent-[#059669]"
								/>
							</label>
						</>
					) : (
						<p className="type-caption text-muted-foreground">
							{f.src.nativeHoles
								? "Kotak foto sudah transparan — tidak perlu chroma key."
								: "Mati. Nyalakan kalau kotak foto diisi warna polos."}
						</p>
					)}
				</div>

				<label className="block space-y-1">
					<span className="text-[13px] font-medium">Nama template</span>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="mis. Floral Gold"
						className="border-border-default bg-background h-10 w-full rounded-xl border px-3 text-sm"
					/>
				</label>
				<div className="space-y-1.5">
					<span className="text-[13px] font-medium">Tema</span>
					<div className="flex flex-wrap gap-1.5">
						{themes.map((th) => (
							<button
								key={th}
								type="button"
								aria-pressed={category === th}
								onClick={() => setCategory(category === th ? "" : th)}
								className={cn(
									"h-8 rounded-full border px-3 text-[12.5px] font-medium",
									category === th
										? "border-transparent bg-foreground text-background"
										: "border-border-default text-muted-foreground",
								)}
							>
								{th}
							</button>
						))}
					</div>
				</div>
				<p className="type-caption text-muted-foreground">
					Template manual memakai teks yang sudah ada di PNG. Untuk teks
					otomatis (nama & tanggal acara), buat template di Booth Studio.
				</p>
				<div className="flex flex-wrap justify-end gap-2">
					<button
						type="button"
						onClick={f.reset}
						className="hover:bg-secondary h-9 rounded-full px-4 text-[13px] font-medium"
					>
						Ganti file
					</button>
					<button
						type="button"
						disabled={
							saving || f.busy || !r || !!r.error || name.trim().length < 2
						}
						onClick={save}
						className="bg-foreground text-background inline-flex h-9 items-center gap-1.5 rounded-full px-5 text-[13px] font-medium disabled:opacity-40"
					>
						{saving && <Loader2 className="size-4 animate-spin" />}
						Simpan template
					</button>
				</div>
			</div>
		</div>
	);
}
