"use client";

import {
	AlertCircleIcon,
	CalendarDaysIcon,
	InboxIcon,
	InfoIcon,
	ShieldAlertIcon,
} from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
	Button,
	ConfirmDialog,
	DataTable,
	DatePicker,
	Disclosure,
	DisclosurePanel,
	DisclosureTrigger,
	EmptyState,
	FileDrop,
	MonthPicker,
	NativeSelect,
	ResponsiveTable,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
	Skeleton,
	TimePicker,
	toast,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui";

export function PrimitivesShowcase() {
	const [theme, setTheme] = useState<"light" | "dark">("dark");
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [destructiveOpen, setDestructiveOpen] = useState(false);

	const wrapperClass = theme === "dark" ? "dark" : "";

	return (
		<TooltipProvider>
			<div
				className={`${wrapperClass} min-h-screen bg-background text-foreground`}
			>
				<div className="mx-auto max-w-5xl px-4 py-6">
					<header className="mb-8 flex flex-col gap-2 border-b border-border-default pb-4 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<h1 className="text-fluid-h1 font-semibold">
								Primitive Showcase
							</h1>
							<p className="text-fluid-body text-muted-foreground">
								Visual smoke-test for every custom UI primitive. F3a additions
								shown live.
							</p>
						</div>
						<div className="flex gap-2">
							<Button
								variant={theme === "light" ? "default" : "outline"}
								size="sm"
								onClick={() => setTheme("light")}
							>
								Light
							</Button>
							<Button
								variant={theme === "dark" ? "default" : "outline"}
								size="sm"
								onClick={() => setTheme("dark")}
							>
								Dark
							</Button>
						</div>
					</header>

					<Section title="Surface hierarchy">
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
							{[1, 2, 3, 4].map((level) => (
								<div
									key={level}
									className={`flex h-20 items-center justify-center rounded-lg border border-border-default bg-surface-${level} text-xs text-muted-foreground`}
								>
									surface-{level}
								</div>
							))}
							<div className="flex h-20 items-center justify-center rounded-lg border border-border-default bg-background text-xs text-muted-foreground">
								background
							</div>
						</div>
					</Section>

					<Section title="Branded gradients">
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div className="flex h-24 items-center justify-center rounded-xl bg-gradient-sunrise text-sm font-medium text-white shadow-glow-sunrise">
								Sunrise
							</div>
							<div className="flex h-24 items-center justify-center rounded-xl bg-gradient-aurora text-sm font-medium text-white shadow-glow-aurora">
								Aurora
							</div>
							<div className="flex h-24 items-center justify-center rounded-xl bg-gradient-sunrise-radial text-sm font-medium text-white">
								Sunrise radial
							</div>
							<div className="flex h-24 items-center justify-center rounded-xl bg-gradient-aurora-radial text-sm font-medium text-white">
								Aurora radial
							</div>
							<div className="col-span-full flex h-24 items-center justify-center rounded-xl bg-gradient-mesh-warm text-sm font-medium text-white">
								Mesh warm (use sparingly)
							</div>
							<div className="col-span-full text-center">
								<span className="text-fluid-display font-semibold text-gradient-sunrise">
									Selamat datang kembali
								</span>
							</div>
						</div>
					</Section>

					<Section title="Fluid type scale">
						<div className="space-y-2">
							<p className="text-fluid-display">display — clamp 28→48</p>
							<p className="text-fluid-h1">h1 — clamp 22→32</p>
							<p className="text-fluid-h2">h2 — clamp 18→24</p>
							<p className="text-fluid-h3">h3 — clamp 16→20</p>
							<p className="text-fluid-body">body — clamp 13→16</p>
							<p className="text-fluid-caption uppercase tracking-wider text-muted-foreground">
								caption — clamp 11→12
							</p>
						</div>
					</Section>

					<Section title="Buttons (existing)">
						<div className="flex flex-wrap gap-2">
							<Button>Default</Button>
							<Button variant="outline">Outline</Button>
							<Button variant="secondary">Secondary</Button>
							<Button variant="ghost">Ghost</Button>
							<Button variant="destructive">Destructive</Button>
							<Button variant="link">Link</Button>
						</div>
					</Section>

					<Section title="Skeleton (F3a)">
						<div className="space-y-3">
							<Skeleton className="h-6 w-1/3" />
							<Skeleton className="h-4 w-2/3" />
							<Skeleton className="h-4 w-1/2" />
							<div className="flex gap-3">
								<Skeleton className="size-10 rounded-full" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-4 w-1/3" />
									<Skeleton className="h-3 w-2/3" />
								</div>
							</div>
						</div>
					</Section>

					<Section title="Empty state (F3a) — default + hero">
						<div className="grid gap-4 md:grid-cols-2">
							<EmptyState
								icon={InboxIcon}
								title="Belum ada notifikasi"
								description="Semua sudah dibaca. Notifikasi baru akan muncul di sini."
							/>
							<EmptyState
								variant="hero"
								icon={CalendarDaysIcon}
								title="Belum ada event terjadwal"
								description="Tambah event baru untuk mulai mengatur tim dan equipment."
								action={<Button>Buat event</Button>}
							/>
						</div>
					</Section>

					<Section title="Disclosure (F3a)">
						<div className="rounded-lg border border-border-default bg-surface-2">
							<Disclosure>
								<DisclosureTrigger>Detail teknis event</DisclosureTrigger>
								<DisclosurePanel>
									Tipe event, kategori, package, jam mulai, jam selesai. Rincian
									ini di-collapse default agar form terasa ringan.
								</DisclosurePanel>
							</Disclosure>
							<div className="border-t border-border-subtle">
								<Disclosure>
									<DisclosureTrigger>Catatan internal</DisclosureTrigger>
									<DisclosurePanel>
										Field opsional untuk catatan tim ops. Tidak terlihat oleh
										klien.
									</DisclosurePanel>
								</Disclosure>
							</div>
						</div>
					</Section>

					<Section title="Tooltip (F3a)">
						<div className="flex gap-3">
							<Tooltip>
								<TooltipTrigger
									render={
										<Button variant="outline" size="icon">
											<InfoIcon />
										</Button>
									}
								/>
								<TooltipContent>Info tambahan tentang field ini</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button variant="outline" size="sm">
											Hover untuk shortcut
										</Button>
									}
								/>
								<TooltipContent>⌘ K untuk command palette</TooltipContent>
							</Tooltip>
						</div>
					</Section>

					<Section title="Alert dialog + Confirm dialog (F3a)">
						<div className="flex flex-wrap gap-2">
							<AlertDialog>
								<AlertDialogTrigger
									render={<Button variant="outline">Open alert</Button>}
								/>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											<span className="flex items-center gap-2">
												<AlertCircleIcon className="size-4 text-amber-500" />
												Heads up
											</span>
										</AlertDialogTitle>
										<AlertDialogDescription>
											Ini contoh alert dialog Base UI yang dipasangkan dengan
											token Tetra. Tombol di footer hanya untuk dismiss; tidak
											ada alur destructive di sini.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogAction>OK</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>

							<Button onClick={() => setConfirmOpen(true)}>
								Open confirm (default)
							</Button>
							<ConfirmDialog
								open={confirmOpen}
								onOpenChange={setConfirmOpen}
								title="Konfirmasi aksi"
								description="Lanjutkan tindakan ini? Bisa dibatalkan setelah submit."
								confirmLabel="Lanjut"
								onConfirm={async () => {
									await new Promise((r) => setTimeout(r, 600));
								}}
							/>

							<Button
								variant="destructive"
								onClick={() => setDestructiveOpen(true)}
							>
								Open confirm (destructive)
							</Button>
							<ConfirmDialog
								open={destructiveOpen}
								onOpenChange={setDestructiveOpen}
								title="Hapus event ini?"
								description="Aksi ini tidak bisa di-undo. Semua data terkait event akan dihapus permanent."
								confirmLabel="Hapus"
								variant="destructive"
								onConfirm={async () => {
									await new Promise((r) => setTimeout(r, 600));
								}}
							/>
						</div>
					</Section>

					<Section title="Native select (F3b) — drop-in for raw <select>">
						<div className="flex flex-wrap items-center gap-3">
							<NativeSelect
								placeholder="Pilih kategori"
								options={[
									{ value: "wedding", label: "Wedding" },
									{ value: "birthday", label: "Ulang tahun" },
									{ value: "corporate", label: "Corporate" },
									{ value: "engagement", label: "Engagement", disabled: true },
								]}
							/>
							<NativeSelect
								size="sm"
								placeholder="Status"
								options={[
									{ value: "draft", label: "Draft" },
									{ value: "confirmed", label: "Confirmed" },
									{ value: "settled", label: "Settled" },
								]}
							/>
						</div>
					</Section>

					<Section title="File drop (F3b) — drag-drop file input">
						<div className="grid gap-4 md:grid-cols-2">
							<FileDrop
								accept=".csv"
								hint="CSV up to 10 MB"
								maxSizeBytes={10 * 1024 * 1024}
							/>
							<FileDrop
								accept="image/*"
								multiple
								hint="Gambar (jpg, png, webp). Multi-select."
							/>
						</div>
					</Section>

					<Section title="Toast (F3b) — sonner wired with token theme">
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								onClick={() => toast.success("Berhasil disimpan")}
							>
								Success
							</Button>
							<Button
								variant="outline"
								onClick={() => toast.error("Gagal: koneksi terputus")}
							>
								Error
							</Button>
							<Button
								variant="outline"
								onClick={() => toast.info("Sinkronisasi dimulai")}
							>
								Info
							</Button>
							<Button
								variant="outline"
								onClick={() =>
									toast.warning("Stok backdrop hampir habis (3 tersisa)")
								}
							>
								Warning
							</Button>
							<Button
								variant="outline"
								onClick={() =>
									toast.promise(
										new Promise((resolve) => setTimeout(resolve, 1500)),
										{
											loading: "Menyimpan event…",
											success: "Event tersimpan",
											error: "Gagal menyimpan",
										},
									)
								}
							>
								Promise
							</Button>
						</div>
					</Section>

					<Section title="Date / Time / Month picker (F3c)">
						<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
							<div className="flex flex-col gap-1">
								<label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									Tanggal event
								</label>
								<DatePicker placeholder="Pilih tanggal" />
							</div>
							<div className="flex flex-col gap-1">
								<label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									Bulan laporan
								</label>
								<MonthPicker placeholder="Pilih bulan" />
							</div>
							<div className="flex flex-col gap-1">
								<label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
									Jam mulai
								</label>
								<TimePicker defaultValue="14:00" />
							</div>
						</div>
					</Section>

					<Section title="Responsive table (F3c) — table on desktop, card list on mobile">
						<ResponsiveTable
							columns={[
								{ key: "client", header: "Klien" },
								{ key: "date", header: "Tanggal" },
								{ key: "venue", header: "Venue", className: "hidden lg:table-cell" },
								{
									key: "status",
									header: "Status",
									align: "right",
									render: (row: SampleRow) => (
										<span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs">
											{row.status}
										</span>
									),
								},
							]}
							rows={sampleRows}
							keyExtractor={(r) => r.id}
						/>
					</Section>

					<Section title="Data table (F3c) — search + paginate">
						<DataTable
							columns={[
								{ key: "client", header: "Klien" },
								{ key: "date", header: "Tanggal" },
								{
									key: "status",
									header: "Status",
									render: (row: SampleRow) => (
										<span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs">
											{row.status}
										</span>
									),
								},
							]}
							rows={sampleRows}
							keyExtractor={(r) => r.id}
							searchKeys={["client", "venue"]}
							searchPlaceholder="Cari klien atau venue…"
							pageSize={3}
						/>
					</Section>

					<Section title="Sheet (F3a) — bottom + right">
						<div className="flex gap-2">
							<Sheet>
								<SheetTrigger
									render={
										<Button variant="outline">
											<ShieldAlertIcon /> Open bottom sheet
										</Button>
									}
								/>
								<SheetContent side="bottom">
									<SheetHeader>
										<SheetTitle>Filter event</SheetTitle>
										<SheetDescription>
											Pakai sheet untuk form panjang di mobile. Default side =
											bottom (native-feel).
										</SheetDescription>
									</SheetHeader>
									<div className="space-y-3 py-2 text-sm text-muted-foreground">
										<p>Konten panel form / filter.</p>
										<p>
											Mendukung 4 side: top, bottom, left, right. Mobile default
											pakai bottom.
										</p>
									</div>
								</SheetContent>
							</Sheet>
							<Sheet>
								<SheetTrigger
									render={<Button variant="outline">Open right sheet</Button>}
								/>
								<SheetContent side="right">
									<SheetHeader>
										<SheetTitle>Detail panel</SheetTitle>
										<SheetDescription>
											Side panel desktop variant.
										</SheetDescription>
									</SheetHeader>
									<div className="text-sm text-muted-foreground">
										<p>Useful untuk preview / inspector pattern.</p>
									</div>
								</SheetContent>
							</Sheet>
						</div>
					</Section>
				</div>
			</div>
		</TooltipProvider>
	);
}

interface SampleRow {
	id: string;
	client: string;
	date: string;
	venue: string;
	status: string;
}

const sampleRows: SampleRow[] = [
	{
		id: "1",
		client: "Maman Sudarman",
		date: "22 Aug 2026",
		venue: "Hotel Indonesia",
		status: "Confirmed",
	},
	{
		id: "2",
		client: "Aulia Wedding",
		date: "5 Sep 2026",
		venue: "Bali Beach",
		status: "Settled",
	},
	{
		id: "3",
		client: "PT Karya Indah",
		date: "12 Sep 2026",
		venue: "JCC",
		status: "Pending",
	},
	{
		id: "4",
		client: "Cahaya Bersama",
		date: "20 Sep 2026",
		venue: "Hotel Mulia",
		status: "Confirmed",
	},
	{
		id: "5",
		client: "Dewi Lestari",
		date: "1 Oct 2026",
		venue: "Sentul",
		status: "Draft",
	},
];

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mb-10">
			<h2 className="mb-3 text-fluid-h3 font-medium text-foreground">
				{title}
			</h2>
			<div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
				{children}
			</div>
		</section>
	);
}
