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
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
	Button,
	ConfirmDialog,
	Disclosure,
	DisclosurePanel,
	DisclosureTrigger,
	EmptyState,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
	Skeleton,
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
