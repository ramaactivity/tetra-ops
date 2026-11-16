"use client";

import { Loader2, SlidersHorizontal, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	drawPreview,
	processFrame,
	readFrame,
} from "@/lib/design/process-frame";
import { nameFromFile } from "@/lib/design/template-name";
import type { FrameSize } from "@/lib/portal/design";
import { cn } from "@/lib/utils";
import { checker, FrameUploader, uploadTemplate } from "./frame-uploader";

type Item = {
	id: string;
	file: File;
	name: string;
	status: "reading" | "ready" | "problem" | "saving" | "failed";
	frameSize: FrameSize | null;
	orientation: "portrait" | "landscape";
	slots: number;
	/** Alasan belum bisa dipakai / gagal simpan. */
	message: string | null;
	thumb: string | null;
};

const SIZE_CHIP: Record<FrameSize, { label: string; cls: string }> = {
	"4R": { label: "4R", cls: "bg-sky-100 text-sky-800" },
	"2R": { label: "2R strip", cls: "bg-lime-100 text-lime-800" },
	polaroid: { label: "Polaroid", cls: "bg-orange-100 text-orange-800" },
};

/** Baca satu file: ukuran (4R/2R/polaroid) & kotak foto terdeteksi otomatis. */
async function inspect(file: File): Promise<Partial<Item>> {
	if (!/^image\/(png|jpeg|webp)$/.test(file.type))
		return { status: "problem", message: "Bukan gambar PNG/JPG/WebP." };
	if (file.size > 25 * 1024 * 1024)
		return { status: "problem", message: "Lebih dari 25 MB." };
	const r = processFrame(await readFrame(file));
	const c = document.createElement("canvas");
	drawPreview(c, r, 120);
	return {
		status: r.error ? "problem" : "ready",
		frameSize: r.frameSize,
		orientation: r.orientation,
		slots: r.slots.length,
		message: r.error,
		thumb: c.toDataURL("image/png"),
	};
}

/**
 * Tambah banyak template PNG sekaligus: tarik semua file → tiap file dibaca
 * otomatis (ukuran, kotak foto, nama dari nama file) → "Simpan semua".
 * File yang bermasalah bisa diatur satu per satu lewat editor biasa.
 */
export function BatchFrameUploader({
	themes,
	onDone,
}: {
	themes: string[];
	/** close=true kalau daftar sudah kosong (semua tersimpan). */
	onDone: (close: boolean) => void;
}) {
	const [items, setItems] = useState<Item[]>([]);
	const [category, setCategory] = useState("");
	const [progress, setProgress] = useState<{
		done: number;
		total: number;
	} | null>(null);
	const [editing, setEditing] = useState<Item | null>(null);
	const [over, setOver] = useState(false);
	// Dibaca satu per satu: PNG 4R 2× (2400×3600) ≈ 35 MB piksel per file.
	const queue = useRef(Promise.resolve());

	const patch = (id: string, p: Partial<Item>) =>
		setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

	function add(list: FileList | null) {
		const files = [...(list ?? [])];
		const fresh: Item[] = files
			.filter(
				(f) =>
					!items.some(
						(x) =>
							x.file.name === f.name &&
							x.file.size === f.size &&
							x.file.lastModified === f.lastModified,
					),
			)
			.map((file) => ({
				id: crypto.randomUUID(),
				file,
				name: nameFromFile(file.name),
				status: "reading",
				frameSize: null,
				orientation: "portrait",
				slots: 0,
				message: null,
				thumb: null,
			}));
		setItems((xs) => [...xs, ...fresh]);
		for (const it of fresh)
			queue.current = queue.current.then(async () => {
				try {
					patch(it.id, await inspect(it.file));
				} catch {
					patch(it.id, {
						status: "problem",
						message: "File tidak bisa dibaca.",
					});
				}
			});
	}

	const savable = items.filter(
		(x) =>
			(x.status === "ready" || x.status === "failed") &&
			x.frameSize &&
			x.name.trim().length >= 2,
	);
	const reading = items.some((x) => x.status === "reading");
	const problems = items.filter((x) => x.status === "problem").length;
	const count = (s: FrameSize) =>
		items.filter((x) => x.frameSize === s && x.status !== "problem").length;

	async function saveAll() {
		const todo = savable;
		setProgress({ done: 0, total: todo.length });
		let ok = 0;
		for (const it of todo) {
			patch(it.id, { status: "saving", message: null });
			try {
				// Olah ulang dari file asli (pengaturan otomatis yang sama dengan
				// pratinjau) — hasil piksel tidak disimpan supaya memori tetap ringan.
				await uploadTemplate(
					processFrame(await readFrame(it.file)),
					it.name,
					category,
				);
				ok++;
				setItems((xs) => xs.filter((x) => x.id !== it.id));
			} catch (e) {
				patch(it.id, {
					status: "failed",
					message: e instanceof Error ? e.message : "Gagal menyimpan",
				});
			}
			setProgress((p) => p && { ...p, done: p.done + 1 });
		}
		setProgress(null);
		const failed = todo.length - ok;
		if (ok > 0) toast.success(`${ok} template ditambahkan`);
		if (failed > 0)
			toast.error(`${failed} gagal disimpan — lihat keterangannya`);
		onDone(ok === items.length);
	}

	if (editing)
		return (
			<FrameUploader
				key={editing.id}
				themes={themes}
				initialFile={editing.file}
				defaultName={editing.name}
				defaultCategory={category}
				onCancel={() => setEditing(null)}
				onDone={() => {
					const left = items.filter((x) => x.id !== editing.id);
					setItems(left);
					setEditing(null);
					onDone(left.length === 0);
				}}
			/>
		);

	const busy = progress !== null;

	return (
		<div className="space-y-3">
			<label
				className={cn(
					"grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed text-center transition-colors",
					items.length ? "gap-1 px-4 py-4" : "gap-2 px-6 py-12",
					over
						? "border-foreground/40 bg-secondary"
						: "border-border-default hover:bg-secondary/50",
					busy && "pointer-events-none opacity-60",
				)}
				onDragOver={(e) => {
					e.preventDefault();
					setOver(true);
				}}
				onDragLeave={() => setOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setOver(false);
					add(e.dataTransfer.files);
				}}
			>
				<Upload className="size-5 text-muted-foreground" aria-hidden />
				<span className="text-[14px] font-semibold">
					{items.length
						? "Tambah file lagi"
						: "Tarik PNG ke sini atau klik untuk memilih"}
				</span>
				{!items.length && (
					<span className="type-caption max-w-sm text-muted-foreground">
						Bisa banyak sekaligus. Ukuran (4R, 2R strip, polaroid) & kotak foto
						terbaca otomatis. Maks 25 MB per file.
					</span>
				)}
				<input
					type="file"
					multiple
					accept="image/png,image/jpeg,image/webp"
					className="sr-only"
					onChange={(e) => {
						add(e.target.files);
						e.target.value = "";
					}}
				/>
			</label>

			{items.length > 0 && (
				<>
					<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
						<span className="font-medium text-foreground">
							{items.length} file
						</span>
						{(Object.keys(SIZE_CHIP) as FrameSize[]).map((s) =>
							count(s) ? (
								<span
									key={s}
									className={cn(
										"rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
										SIZE_CHIP[s].cls,
									)}
								>
									{SIZE_CHIP[s].label} {count(s)}
								</span>
							) : null,
						)}
						{problems > 0 && (
							<span className="text-rose-700">{problems} perlu diatur</span>
						)}
						{reading && (
							<span className="inline-flex items-center gap-1">
								<Loader2 className="size-3 animate-spin" aria-hidden />
								membaca…
							</span>
						)}
					</p>

					<ul className="max-h-[46dvh] divide-y divide-border-subtle overflow-y-auto rounded-2xl border border-border-subtle bg-secondary/40">
						{items.map((it) => (
							<Row
								key={it.id}
								it={it}
								disabled={busy}
								onName={(name) => patch(it.id, { name })}
								onEdit={() => setEditing(it)}
								onRemove={() =>
									setItems((xs) => xs.filter((x) => x.id !== it.id))
								}
							/>
						))}
					</ul>

					<div className="space-y-1.5">
						<span className="text-[13px] font-medium">
							Tema{" "}
							<span className="font-normal text-muted-foreground">
								(opsional, untuk semua file)
							</span>
						</span>
						<div className="flex flex-wrap gap-1.5">
							{themes.map((th) => (
								<button
									key={th}
									type="button"
									aria-pressed={category === th}
									disabled={busy}
									onClick={() => setCategory(category === th ? "" : th)}
									className={cn(
										"press h-8 rounded-full border px-3 text-[12.5px] font-medium",
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

					<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
						<p className="type-caption max-w-md text-muted-foreground">
							Teks ikut dari PNG. Untuk teks otomatis (nama & tanggal acara),
							buat template di Booth Studio.
						</p>
						<button
							type="button"
							disabled={busy || reading || savable.length === 0}
							onClick={saveAll}
							className="press inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-5 text-[13px] font-medium text-background disabled:opacity-40"
						>
							{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
							{busy
								? `Menyimpan ${progress.done + 1}/${progress.total}…`
								: `Simpan ${savable.length} template`}
						</button>
					</div>
				</>
			)}
		</div>
	);
}

function Row({
	it,
	disabled,
	onName,
	onEdit,
	onRemove,
}: {
	it: Item;
	disabled: boolean;
	onName: (name: string) => void;
	onEdit: () => void;
	onRemove: () => void;
}) {
	const chip = it.frameSize ? SIZE_CHIP[it.frameSize] : null;
	const bad = it.status === "problem" || it.status === "failed";
	return (
		<li className="flex items-center gap-3 px-3 py-2.5">
			<div
				className="grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded-lg"
				style={{
					background: it.thumb
						? `url(${it.thumb}) center / contain no-repeat, ${checker}`
						: checker,
				}}
			>
				{!it.thumb && it.status === "reading" && (
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
				)}
			</div>
			<div className="min-w-0 flex-1 space-y-1">
				<input
					value={it.name}
					onChange={(e) => onName(e.target.value)}
					disabled={disabled}
					aria-label={`Nama template ${it.file.name}`}
					className="h-8 w-full rounded-lg border border-border-default bg-card px-2.5 text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
				<p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-muted-foreground">
					{it.status === "reading" && <span>Membaca {it.file.name}…</span>}
					{chip && !bad && (
						<span
							className={cn(
								"rounded-full px-2 py-px text-[11px] font-semibold",
								chip.cls,
							)}
						>
							{chip.label}
						</span>
					)}
					{it.status !== "reading" && !bad && (
						<span>
							{it.orientation === "landscape" ? "landscape · " : ""}
							{it.slots} kotak foto
						</span>
					)}
					{it.status === "saving" && (
						<span className="inline-flex items-center gap-1">
							<Loader2 className="size-3 animate-spin" aria-hidden />
							menyimpan…
						</span>
					)}
					{bad && <span className="text-rose-700">{it.message}</span>}
					{it.name.trim().length < 2 && it.status === "ready" && (
						<span className="text-rose-700">Nama minimal 2 huruf</span>
					)}
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{it.status !== "reading" && it.status !== "saving" && (
					<button
						type="button"
						onClick={onEdit}
						disabled={disabled}
						title="Atur warna kotak foto & pratinjau"
						aria-label="Atur"
						className={cn(
							"press inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium sm:px-3",
							bad
								? "border-foreground bg-foreground text-background"
								: "border-border-default bg-card text-foreground hover:bg-secondary",
						)}
					>
						<SlidersHorizontal className="size-3.5" aria-hidden />
						<span className="hidden sm:inline">Atur</span>
					</button>
				)}
				<button
					type="button"
					onClick={onRemove}
					disabled={disabled || it.status === "saving"}
					aria-label={`Buang ${it.file.name}`}
					className="press grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
				>
					<X className="size-4" aria-hidden />
				</button>
			</div>
		</li>
	);
}
