"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import {
	createDesignTemplate,
	requestTemplatePreviewUpload,
	setDesignTemplateActive,
} from "@/lib/actions/design-admin";
import { FRAME_SIZES, type FrameSize } from "@/lib/portal/design";
import { createClient } from "@/lib/supabase/client";

const field =
	"h-9 w-full rounded-full border border-border-subtle bg-card px-4 text-[13px]";
const chip = (on: boolean) =>
	`h-8 rounded-full border px-3 text-[13px] ${on ? "border-foreground bg-foreground text-background" : "border-border-subtle"}`;

/** Form tambah template frame untuk katalog portal. */
export function TemplateForm() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [category, setCategory] = useState("");
	const [frame, setFrame] = useState<FrameSize>("4R");
	const [orientation, setOrientation] = useState<"portrait" | "landscape">(
		"portrait",
	);
	const [file, setFile] = useState<File | null>(null);
	const [layoutId, setLayoutId] = useState("");
	const [presetId, setPresetId] = useState("");
	const [busy, setBusy] = useState(false);

	async function save() {
		if (!file) return;
		setBusy(true);
		try {
			const up = await requestTemplatePreviewUpload({
				type: file.type,
				size: file.size,
			});
			if (!up.ok) throw new Error(up.error);
			const { error } = await createClient()
				.storage.from("portal-private")
				.uploadToSignedUrl(up.path, up.token, file, { contentType: file.type });
			if (error) throw new Error("Upload pratinjau gagal");
			const res = await createDesignTemplate({
				name,
				category,
				frameSize: frame,
				orientation,
				previewPath: up.path,
				boothLayoutId: layoutId.trim(),
				boothPresetId: presetId.trim(),
			});
			if (!res.ok) throw new Error(res.error);
			toast.success("Template ditambahkan");
			setName("");
			setCategory("");
			setFile(null);
			setLayoutId("");
			setPresetId("");
			router.refresh();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
		}
		setBusy(false);
	}

	return (
		<div className="space-y-2 rounded-[16px] border border-border-subtle bg-card p-4">
			<p className="text-[14px] font-semibold">Tambah template</p>
			<div className="grid gap-2 sm:grid-cols-2">
				<input
					className={field}
					placeholder="Nama, mis. Floral Gold"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<input
					className={field}
					placeholder="Tema, mis. Wedding"
					value={category}
					onChange={(e) => setCategory(e.target.value)}
				/>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{FRAME_SIZES.map((f) => (
					<button
						key={f}
						type="button"
						className={chip(frame === f)}
						onClick={() => setFrame(f)}
					>
						{f}
					</button>
				))}
				<span className="mx-1" />
				{(["portrait", "landscape"] as const).map((o) => (
					<button
						key={o}
						type="button"
						className={chip(orientation === o)}
						onClick={() => setOrientation(o)}
					>
						{o === "portrait" ? "Portrait" : "Landscape"}
					</button>
				))}
			</div>
			<label className="flex cursor-pointer items-center gap-2 text-[13px]">
				<Plus className="size-4" />
				<span className="underline">
					{file ? file.name : "Gambar pratinjau (JPG/PNG/WebP)"}
				</span>
				<input
					type="file"
					accept="image/jpeg,image/png,image/webp"
					className="sr-only"
					onChange={(e) => setFile(e.target.files?.[0] ?? null)}
				/>
			</label>
			<div className="grid gap-2 sm:grid-cols-2">
				<input
					className={field}
					placeholder="Booth layout id (opsional, uuid)"
					value={layoutId}
					onChange={(e) => setLayoutId(e.target.value)}
				/>
				<input
					className={field}
					placeholder="Booth preset id (opsional)"
					value={presetId}
					onChange={(e) => setPresetId(e.target.value)}
				/>
			</div>
			<Button
				size="sm"
				disabled={busy || name.trim().length < 2 || !file}
				onClick={save}
			>
				{busy ? <Loader2 className="animate-spin" /> : <Plus />} Simpan template
			</Button>
		</div>
	);
}

export function TemplateActiveToggle({
	id,
	active,
}: {
	id: string;
	active: boolean;
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	return (
		<button
			type="button"
			disabled={busy}
			className="text-[12.5px] font-medium underline"
			onClick={async () => {
				setBusy(true);
				const res = await setDesignTemplateActive(id, !active);
				setBusy(false);
				if (!res.ok) toast.error(res.error);
				else router.refresh();
			}}
		>
			{active ? "Sembunyikan" : "Tampilkan lagi"}
		</button>
	);
}
