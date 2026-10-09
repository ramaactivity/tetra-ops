"use client";

import {
	ExternalLink,
	ImagePlus,
	LayoutTemplate,
	MoreHorizontal,
	Pencil,
	RefreshCw,
	Star,
	Trash2,
	Type,
	Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterSearchInput } from "@/components/ui/filter-search-input";
import { Switch } from "@/components/ui/switch";
import {
	deleteDesignTemplate,
	syncBoothTemplates,
	updateDesignTemplate,
} from "@/lib/actions/design-admin";
import { cn } from "@/lib/utils";
import { FrameUploader } from "./frame-uploader";

export type StudioTemplate = {
	id: string;
	name: string;
	category: string | null;
	frame_size: string;
	orientation: string;
	url: string | null;
	source: "manual" | "booth";
	text_mode: "native" | "baked";
	slot_count: number | null;
	is_active: boolean;
	featured: boolean;
	booth_archived: boolean;
	used: number;
};

export const THEMES = [
	"Wedding",
	"Engagement",
	"Birthday",
	"Sweet 17",
	"Corporate",
	"Graduation",
	"Aqiqah",
	"Umum",
];

const SIZES = [
	["semua", "Semua ukuran"],
	["4R", "4R"],
	["2R", "2R strip"],
	["polaroid", "Polaroid"],
] as const;
const STATUS = [
	["semua", "Semua"],
	["tampil", "Tampil di portal"],
	["sembunyi", "Disembunyikan"],
	["unggulan", "Unggulan"],
] as const;

const chip = (on: boolean) =>
	cn(
		"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium",
		on
			? "border-transparent bg-foreground text-background"
			: "border-border-default bg-card text-muted-foreground hover:text-foreground",
	);
const card =
	"border-border-default bg-card rounded-2xl border shadow-[var(--shadow-level-2)]";
const checker =
	"repeating-conic-gradient(#efede8 0% 25%, #fff 0% 50%) 50% / 14px 14px";

export function TemplateStudio({
	templates,
	boothReady,
	boothAdminUrl,
	lastSynced,
}: {
	templates: StudioTemplate[];
	boothReady: boolean;
	boothAdminUrl: string | null;
	lastSynced: string | null;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	const [q, setQ] = useState("");
	const [size, setSize] = useState<(typeof SIZES)[number][0]>("semua");
	const [status, setStatus] = useState<(typeof STATUS)[number][0]>("semua");
	const [theme, setTheme] = useState("semua");
	const [adding, setAdding] = useState(false);
	const [editing, setEditing] = useState<StudioTemplate | null>(null);

	const themes = useMemo(
		() =>
			[
				...new Set([
					...THEMES,
					...templates.map((t) => t.category).filter(Boolean),
				]),
			] as string[],
		[templates],
	);
	const live = templates.filter((t) => !t.booth_archived);
	const shown = live
		.filter((t) => size === "semua" || t.frame_size === size)
		.filter((t) => theme === "semua" || t.category === theme)
		.filter((t) =>
			status === "tampil"
				? t.is_active
				: status === "sembunyi"
					? !t.is_active
					: status === "unggulan"
						? t.featured
						: true,
		)
		.filter((t) =>
			`${t.name} ${t.category ?? ""}`.toLowerCase().includes(q.toLowerCase()),
		);

	const run = (
		fn: () => Promise<{ ok: boolean; error?: string; note?: string }>,
		ok?: string,
	) =>
		start(async () => {
			const r = await fn();
			if (!r.ok) return void toast.error(r.error ?? "Gagal");
			if (ok || r.note) toast.success(r.note ?? ok);
			router.refresh();
		});

	const stats = [
		["Template", live.length],
		["Tampil di portal", live.filter((t) => t.is_active).length],
		["Teks otomatis", live.filter((t) => t.text_mode === "native").length],
		["Dipilih klien", live.reduce((s, t) => s + t.used, 0)],
	] as const;

	return (
		<div className="space-y-3">
			{/* Header + aksi */}
			<section className={cn(card, "p-5")}>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0 flex-1 basis-72">
						<h1 className="type-heading text-[20px]">Template Frame</h1>
						<p className="type-secondary mt-1 max-w-2xl">
							Etalase desain yang bisa dipilih klien di dashboard-nya. Template
							dibuat di Booth Studio (overlay tanpa teks + teks otomatis), lalu
							tampil di sini untuk dikurasi.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							disabled={pending || !boothReady}
							title={boothReady ? undefined : "Koneksi ke Booth belum diatur"}
							onClick={() => run(() => syncBoothTemplates())}
							className="bg-foreground text-background inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium disabled:opacity-40"
						>
							<RefreshCw
								className={cn("size-4 shrink-0", pending && "animate-spin")}
							/>
							Sinkron dari Booth
						</button>
						<button
							type="button"
							onClick={() => setAdding(true)}
							className="border-border-default hover:bg-secondary inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium"
						>
							<ImagePlus className="size-4 shrink-0" /> Tambah PNG manual
						</button>
						{boothAdminUrl && (
							<a
								href={boothAdminUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="border-border-default hover:bg-secondary inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium"
							>
								<ExternalLink className="size-4 shrink-0" /> Booth Studio
							</a>
						)}
					</div>
				</div>

				<ol className="mt-4 grid gap-2 sm:grid-cols-3">
					{[
						[
							"1",
							"Buat di Booth Studio",
							"Unggah overlay PNG tanpa teks, atur teks & font di editor Booth.",
						],
						[
							"2",
							"Sinkron ke etalase",
							"Template muncul di sini. Atur tema, unggulan, dan tampil/tidak.",
						],
						[
							"3",
							"Klien pilih, teks terisi",
							"Nama & tanggal acara otomatis masuk ke frame. Tanpa edit Photoshop.",
						],
					].map(([n, t, d]) => (
						<li key={n} className="bg-secondary/60 flex gap-3 rounded-xl p-3">
							<span className="bg-foreground text-background grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold">
								{n}
							</span>
							<div className="min-w-0">
								<p className="text-[13.5px] font-semibold">{t}</p>
								<p className="type-caption text-muted-foreground">{d}</p>
							</div>
						</li>
					))}
				</ol>
				<p className="type-caption text-muted-foreground mt-3">
					{boothReady
						? lastSynced
							? `Terakhir sinkron ${new Date(lastSynced).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}.`
							: "Belum pernah sinkron dari Booth."
						: "Koneksi ke Booth belum diatur — sementara pakai template PNG manual."}
				</p>
			</section>

			<dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{stats.map(([k, v]) => (
					<div key={k} className={cn(card, "p-4")}>
						<dt className="eyebrow text-muted-foreground">{k}</dt>
						<dd className="tabular mt-1.5 text-[22px] font-semibold leading-none">
							{v}
						</dd>
					</div>
				))}
			</dl>

			{/* Filter */}
			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-2">
					<FilterSearchInput
						value={q}
						onValueChange={setQ}
						placeholder="Cari nama atau tema…"
						className="w-full sm:max-w-xs"
					/>
					<select
						value={theme}
						onChange={(e) => setTheme(e.target.value)}
						aria-label="Tema"
						className="border-border-default bg-card h-8 rounded-full border px-3 text-[13px]"
					>
						<option value="semua">Semua tema</option>
						{themes.map((t) => (
							<option key={t} value={t}>
								{t}
							</option>
						))}
					</select>
				</div>
				<div className="hide-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
					{SIZES.map(([k, l]) => (
						<button
							key={k}
							type="button"
							aria-pressed={size === k}
							onClick={() => setSize(k)}
							className={chip(size === k)}
						>
							{l}
						</button>
					))}
					<span className="bg-border-default mx-1 w-px shrink-0" />
					{STATUS.map(([k, l]) => (
						<button
							key={k}
							type="button"
							aria-pressed={status === k}
							onClick={() => setStatus(k)}
							className={chip(status === k)}
						>
							{l}
						</button>
					))}
				</div>
			</div>

			{/* Grid */}
			{shown.length === 0 ? (
				<div
					className={cn(
						card,
						"grid place-items-center gap-2 px-6 py-14 text-center",
					)}
				>
					<span className="bg-secondary grid size-12 place-items-center rounded-full">
						<LayoutTemplate className="size-5 text-muted-foreground" />
					</span>
					<p className="type-heading">
						{live.length === 0 ? "Belum ada template" : "Tidak ada yang cocok"}
					</p>
					<p className="type-secondary max-w-sm">
						{live.length === 0
							? "Buat template di Booth Studio lalu tekan Sinkron, atau tambahkan PNG manual."
							: "Coba ubah filter atau kata kunci."}
					</p>
				</div>
			) : (
				<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{shown.map((t) => (
						<li
							key={t.id}
							className={cn(
								card,
								"group flex min-w-0 flex-col overflow-hidden",
								!t.is_active && "opacity-60",
							)}
						>
							<div
								className="relative grid aspect-[3/4] place-items-center overflow-hidden p-3"
								style={{ background: checker }}
							>
								{t.url ? (
									// biome-ignore lint/performance/noImgElement: URL pratinjau eksternal/privat.
									<img
										src={t.url}
										alt={t.name}
										loading="lazy"
										className="max-h-full max-w-full rounded-md object-contain shadow-sm"
									/>
								) : (
									<LayoutTemplate className="size-6 text-muted-foreground" />
								)}
								<span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold shadow-sm">
									{t.frame_size}
									{t.orientation === "landscape" ? " · L" : ""}
								</span>
								<button
									type="button"
									aria-label={
										t.featured ? "Lepas unggulan" : "Jadikan unggulan"
									}
									aria-pressed={t.featured}
									disabled={pending}
									onClick={() =>
										run(() =>
											updateDesignTemplate(t.id, { featured: !t.featured }),
										)
									}
									className={cn(
										"absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-white/90 shadow-sm",
										t.featured ? "text-amber-500" : "text-muted-foreground",
									)}
								>
									<Star
										className="size-3.5"
										fill={t.featured ? "currentColor" : "none"}
									/>
								</button>
							</div>
							<div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
								<div className="min-w-0">
									<p className="truncate text-[13.5px] font-semibold">
										{t.name}
									</p>
									<p className="text-muted-foreground truncate text-[12px]">
										{t.category ?? "Tanpa tema"}
										{t.slot_count ? ` · ${t.slot_count} foto` : ""}
										{t.used ? ` · dipilih ${t.used}×` : ""}
									</p>
								</div>
								<div className="flex flex-wrap gap-1">
									<span
										className={cn(
											"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
											t.text_mode === "native"
												? "bg-emerald-500/12 text-emerald-700"
												: "bg-secondary text-muted-foreground",
										)}
									>
										{t.text_mode === "native" ? (
											<Wand2 className="size-3 shrink-0" />
										) : (
											<Type className="size-3 shrink-0" />
										)}
										{t.text_mode === "native" ? "Teks otomatis" : "Teks di PNG"}
									</span>
									<span className="bg-secondary text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
										{t.source === "booth" ? "Booth" : "Manual"}
									</span>
								</div>
								<div className="mt-auto flex items-center justify-between gap-2 pt-1">
									<div className="flex items-center gap-2 text-[12px] font-medium">
										<Switch
											checked={t.is_active}
											disabled={pending}
											aria-label={`Tampilkan ${t.name} di portal`}
											onCheckedChange={() =>
												run(() =>
													updateDesignTemplate(t.id, {
														is_active: !t.is_active,
													}),
												)
											}
										/>
										{t.is_active ? "Tampil" : "Sembunyi"}
									</div>
									<DropdownMenu>
										<DropdownMenuTrigger
											aria-label={`Menu ${t.name}`}
											className="hover:bg-secondary text-muted-foreground grid size-8 place-items-center rounded-full"
										>
											<MoreHorizontal className="size-4" />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onClick={() => setEditing(t)}>
												<Pencil className="size-4" /> Ubah nama & tema
											</DropdownMenuItem>
											{t.url && (
												<DropdownMenuItem
													onClick={() => window.open(t.url ?? "", "_blank")}
												>
													<ExternalLink className="size-4" /> Lihat ukuran penuh
												</DropdownMenuItem>
											)}
											<DropdownMenuItem
												variant="destructive"
												onClick={async () => {
													const viaHide = t.source === "booth" || t.used > 0;
													if (
														await confirm({
															title: viaHide
																? `Sembunyikan ${t.name}?`
																: `Hapus ${t.name}?`,
															description: viaHide
																? "Template ini dari Booth atau pernah dipilih klien, jadi hanya disembunyikan dari portal."
																: "Template manual ini dihapus permanen beserta filenya.",
															confirmLabel: viaHide ? "Sembunyikan" : "Hapus",
															variant: "destructive",
														})
													)
														run(
															() => deleteDesignTemplate(t.id),
															viaHide ? "Disembunyikan" : "Template dihapus",
														);
												}}
											>
												<Trash2 className="size-4" />{" "}
												{t.source === "booth" || t.used > 0
													? "Sembunyikan"
													: "Hapus"}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
						</li>
					))}
				</ul>
			)}

			<Dialog open={adding} onOpenChange={setAdding}>
				<DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>Tambah template PNG manual</DialogTitle>
						<DialogDescription>
							Untuk desain dengan teks sudah di PNG. Kotak foto boleh transparan
							atau diisi satu warna polos — warnanya dihapus otomatis (chroma
							key).
						</DialogDescription>
					</DialogHeader>
					<FrameUploader
						themes={themes}
						onDone={() => {
							setAdding(false);
							router.refresh();
						}}
					/>
				</DialogContent>
			</Dialog>

			<Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Ubah template</DialogTitle>
						<DialogDescription>
							{editing?.source === "booth"
								? "Template Booth: nama & tema ikut Booth saat sinkron berikutnya. Ubah di Booth Studio supaya permanen."
								: "Nama & tema yang tampil di portal klien."}
						</DialogDescription>
					</DialogHeader>
					{editing && (
						<EditForm
							t={editing}
							themes={themes}
							pending={pending}
							onSave={(patch) =>
								run(async () => {
									const r = await updateDesignTemplate(editing.id, patch);
									if (r.ok) setEditing(null);
									return r;
								}, "Template disimpan")
							}
						/>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}

function EditForm({
	t,
	themes,
	pending,
	onSave,
}: {
	t: StudioTemplate;
	themes: string[];
	pending: boolean;
	onSave: (p: { name: string; category: string | null }) => void;
}) {
	const [name, setName] = useState(t.name);
	const [category, setCategory] = useState(t.category ?? "");
	const input =
		"border-border-default bg-background h-10 w-full rounded-xl border px-3 text-sm";
	return (
		<div className="space-y-3">
			<label className="block space-y-1">
				<span className="text-[13px] font-medium">Nama</span>
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					className={input}
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
							className={chip(category === th)}
						>
							{th}
						</button>
					))}
				</div>
			</div>
			<div className="flex justify-end">
				<button
					type="button"
					disabled={pending || name.trim().length < 2}
					onClick={() =>
						onSave({ name: name.trim(), category: category || null })
					}
					className="bg-foreground text-background h-9 rounded-full px-5 text-[13px] font-medium disabled:opacity-40"
				>
					Simpan
				</button>
			</div>
		</div>
	);
}
