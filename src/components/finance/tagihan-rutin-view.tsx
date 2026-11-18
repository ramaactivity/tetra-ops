"use client";

import { Check, MoreHorizontal, Pencil, Plus, Receipt } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CatatLauncher } from "@/components/finance/catat/catat-launcher";
import type { QuickRecordPrefill } from "@/components/finance/catat/quick-record-core";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoneyInput, TextField } from "@/components/ui/form-fields";
import { StatusChip } from "@/components/ui/mobile";
import { toast } from "@/components/ui/toaster";
import {
	type BillInput,
	markBillPaid,
	saveBill,
	setBillEnabled,
} from "@/lib/actions/tagihan-rutin";
import {
	findCategory,
	KELUAR_CATEGORIES,
} from "@/lib/finance/quick-record-categories";
import type { CatatData } from "@/lib/finance/quick-record-data";
import type {
	BillCycle,
	BillRow,
	BillStatus,
} from "@/lib/finance/recurring-bills";
import { cn } from "@/lib/utils";

const tgl = (iso: string, opts: Intl.DateTimeFormatOptions) =>
	new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
		...opts,
		timeZone: "UTC",
	});

function jadwal(b: BillRow): string {
	if (!b.next_due) return "belum ada jadwal";
	if (b.cycle === "monthly") return `tiap tgl ${Number(b.next_due.slice(8))}`;
	const d = tgl(b.next_due, { day: "numeric", month: "short" });
	return b.cycle === "yearly" ? `tiap tahun, ${d}` : `tiap 3 bulan, ${d}`;
}

function StatusPill({ s, today }: { s: BillStatus; today: string }) {
	const chip = "shrink-0 whitespace-nowrap";
	if (s.urgency === "telat")
		return (
			<StatusChip tone="rose" className={chip}>
				{s.bill.kind === "bagi_hasil"
					? "Belum diambil"
					: `Telat ${-s.daysLeft} hari`}
			</StatusChip>
		);
	if (s.urgency === "segera")
		return (
			<StatusChip tone="amber" className={chip}>
				{s.daysLeft === 0
					? "Hari ini"
					: s.daysLeft === 1
						? "Besok"
						: `${s.daysLeft} hari lagi`}
			</StatusChip>
		);
	// "Lunas" hanya kalau periode BULAN INI sudah dibayar — kalau yang lunas baru
	// bulan lalu, tampilkan tanggal jatuh tempo berikutnya (jangan menenangkan palsu).
	const lunasBulanIni =
		s.lastPaid && s.lastPaid.due.slice(0, 7) >= today.slice(0, 7);
	return (
		<StatusChip tone={lunasBulanIni ? "emerald" : "neutral"} className={chip}>
			{lunasBulanIni && s.lastPaid
				? `Lunas ${tgl(s.lastPaid.due, { month: "short" })}`
				: tgl(s.due, {
						day: "numeric",
						month: "short",
						...(s.daysLeft > 45 ? { year: "numeric" } : {}),
					})}
		</StatusChip>
	);
}

export function TagihanRutinView({
	active,
	inactive,
	catatData,
	today,
}: {
	active: BillStatus[];
	inactive: BillRow[];
	catatData: CatatData;
	/** Hari ini (WIB) dari server — supaya status sama dengan cron/Telegram. */
	today: string;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	const [editing, setEditing] = useState<BillRow | "new" | null>(null);
	// Catat bayar: launcher dipasang ulang (key baru) dengan isian tagihan itu.
	const [catat, setCatat] = useState<{
		key: string;
		prefill: QuickRecordPrefill;
	} | null>(null);

	const perlu = active.filter((s) => s.urgency !== "nanti");
	const nanti = active.filter((s) => s.urgency === "nanti");

	function bayar(s: BillStatus) {
		setCatat({
			key: `${s.bill.id}:${Date.now()}`,
			prefill: {
				direction: "keluar",
				amount: s.bill.amount ?? 0,
				categoryId: s.bill.category_id ?? undefined,
				// Nama tagihan jadi keterangan → otomatis cocok dengan kata kuncinya.
				note: s.bill.name,
				periodMonth: s.period,
			},
		});
	}

	function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
		start(async () => {
			const res = await fn();
			if (!res.ok) toast.error(res.error ?? "Gagal");
			else {
				toast.success(ok);
				router.refresh();
			}
		});
	}

	async function tandaiLunas(s: BillStatus) {
		const yes = await confirm({
			title: `Tandai ${s.bill.name} sudah dibayar?`,
			description: `Untuk yang dibayar di luar kas Tetra. Periode jatuh tempo ${tgl(s.due, { day: "numeric", month: "long" })} dan sebelumnya dianggap lunas. Kalau dibayar dari kas Tetra, pakai "Catat bayar" supaya masuk pembukuan.`,
			confirmLabel: "Tandai lunas",
		});
		if (yes)
			run(
				() => markBillPaid(s.bill.id, s.due),
				`${s.bill.name} ditandai lunas`,
			);
	}

	async function sembunyikan(b: BillRow) {
		const yes = await confirm({
			title: `Sembunyikan ${b.name}?`,
			description:
				"Tidak diingatkan lagi. Datanya tetap ada dan bisa diaktifkan kembali.",
			confirmLabel: "Sembunyikan",
		});
		if (yes) run(() => setBillEnabled(b.id, false), `${b.name} disembunyikan`);
	}

	function renderRow(s: BillStatus) {
		const b = s.bill;
		const urgent = s.urgency !== "nanti";
		return (
			<li
				key={b.id}
				className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
			>
				<div className="min-w-0 flex-1 basis-[220px]">
					<div className="flex items-center gap-2">
						<span className="truncate text-[14px] font-semibold">{b.name}</span>
						<StatusPill s={s} today={today} />
					</div>
					<p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
						{jadwal(b)}
						{/* Sisa hari sudah di chip — di sini cukup sejak kapan telatnya. */}
						{s.urgency === "telat"
							? ` · sejak ${tgl(s.due, { day: "numeric", month: "short" })}`
							: ""}
						{s.lastPaid && urgent
							? ` · terakhir dibayar ${tgl(s.lastPaid.date, { day: "numeric", month: "short" })}`
							: ""}
					</p>
				</div>
				{b.amount ? (
					<span className="tabular text-[13.5px] font-medium">
						±Rp{b.amount.toLocaleString("id-ID")}
					</span>
				) : null}
				<div className="ml-auto flex shrink-0 items-center gap-1">
					{b.kind === "bagi_hasil" ? (
						<Link
							href="/finance/bagi-hasil"
							className={cn(
								"inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium",
								urgent
									? "bg-[#059669] text-white hover:bg-[#047857]"
									: "border border-border-subtle hover:bg-secondary",
							)}
						>
							Buka bagi hasil
						</Link>
					) : b.category_id ? (
						<Button
							size="sm"
							variant={urgent ? "default" : "outline"}
							onClick={() => bayar(s)}
							disabled={pending}
						>
							<Receipt className="size-3.5" /> Catat bayar
						</Button>
					) : null}
					<DropdownMenu>
						<DropdownMenuTrigger
							aria-label={`Aksi lain ${b.name}`}
							className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
						>
							<MoreHorizontal className="size-4" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" sideOffset={6} className="w-56">
							<DropdownMenuItem
								onClick={() => tandaiLunas(s)}
								className="gap-2"
							>
								<Check className="size-4" /> Tandai sudah dibayar
							</DropdownMenuItem>
							{b.kind === "bill" ? (
								<DropdownMenuItem
									onClick={() => setEditing(b)}
									className="gap-2"
								>
									<Pencil className="size-4" /> Ubah
								</DropdownMenuItem>
							) : null}
							<DropdownMenuItem
								onClick={() => sembunyikan(b)}
								className="gap-2 text-rose-700"
							>
								Sembunyikan
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</li>
		);
	}

	const card =
		"overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)]";

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<p className="min-w-0 flex-1 basis-[260px] text-[13px] text-muted-foreground">
					Lunas otomatis begitu dibayar lewat <b>Catat bayar</b>. Pengingat H-3
					sampai H+7 ke grup Telegram TETRA BOT, grup WA Tetra Photobooth, dan
					lonceng.
				</p>
				<Button size="sm" onClick={() => setEditing("new")}>
					<Plus className="size-3.5" /> Tambah tagihan
				</Button>
			</div>

			{perlu.length ? (
				<section className={cn(card, "border-amber-200")}>
					<div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5">
						<span className="size-2 rounded-full bg-amber-500" />
						<h2 className="text-[14px] font-semibold text-amber-950">
							Perlu dibayar
						</h2>
						<span className="tabular text-[13px] font-medium text-amber-800">
							{perlu.length}
						</span>
					</div>
					<ul className="divide-y divide-border-subtle">
						{perlu.map(renderRow)}
					</ul>
				</section>
			) : null}

			<section className={card}>
				<div className="border-b border-border-subtle px-4 py-2.5">
					<h2 className="text-[14px] font-semibold">
						{perlu.length ? "Berikutnya" : "Semua aman"}
					</h2>
				</div>
				{nanti.length ? (
					<ul className="divide-y divide-border-subtle">
						{nanti.map(renderRow)}
					</ul>
				) : (
					<p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
						Belum ada tagihan lain.
					</p>
				)}
			</section>

			{inactive.length ? (
				<section className={card}>
					<div className="border-b border-border-subtle px-4 py-2.5">
						<h2 className="text-[14px] font-semibold text-muted-foreground">
							Disembunyikan
						</h2>
					</div>
					<ul className="divide-y divide-border-subtle">
						{inactive.map((b) => (
							<li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
								<span className="min-w-0 flex-1 truncate text-[13.5px] text-muted-foreground">
									{b.name}
								</span>
								<Button
									size="sm"
									variant="ghost"
									disabled={pending}
									onClick={() =>
										run(
											() => setBillEnabled(b.id, true),
											`${b.name} aktif lagi`,
										)
									}
								>
									Aktifkan
								</Button>
							</li>
						))}
					</ul>
				</section>
			) : null}

			{catat ? (
				<CatatLauncher
					key={catat.key}
					data={catatData}
					prefill={catat.prefill}
					autoOpen
				/>
			) : (
				<CatatLauncher data={catatData} />
			)}

			{editing ? (
				<BillDialog
					bill={editing === "new" ? null : editing}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</div>
	);
}

const CYCLES: Array<[BillCycle, string]> = [
	["monthly", "Bulanan"],
	["quarterly", "3 bulanan"],
	["yearly", "Tahunan"],
];

function BillDialog({
	bill,
	onClose,
}: {
	bill: BillRow | null;
	onClose: () => void;
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [f, setF] = useState<BillInput>({
		id: bill?.id ?? null,
		name: bill?.name ?? "",
		amount: bill?.amount ?? 0,
		cycle: bill?.cycle ?? "monthly",
		next_due: bill?.next_due ?? "",
		category_id: bill?.category_id ?? "",
		match_keyword: bill?.match_keyword ?? "",
		notes: bill?.notes ?? "",
	});
	const set = (p: Partial<BillInput>) => setF((v) => ({ ...v, ...p }));

	function simpan() {
		start(async () => {
			const res = await saveBill(f);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Tagihan tersimpan");
			onClose();
			router.refresh();
		});
	}

	const label = "text-[13px] font-medium";
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{bill ? `Ubah ${bill.name}` : "Tambah tagihan rutin"}
					</DialogTitle>
					<DialogDescription>
						Pembayaran dianggap lunas kalau dicatat dengan kategori ini dan
						keterangannya memuat kata kunci.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1.5">
						<span className={label}>Nama</span>
						<TextField
							value={f.name}
							onChange={(e) => set({ name: e.target.value })}
							placeholder="mis. Claude, Canva, Kost"
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<span className={label}>Perkiraan nominal</span>
							<MoneyInput
								value={Number(f.amount ?? 0)}
								onValueChange={(v) => set({ amount: v })}
							/>
						</div>
						<div className="space-y-1.5">
							<span className={label}>
								{f.cycle === "monthly"
									? "Jatuh tempo (tanggal)"
									: "Jatuh tempo berikutnya"}
							</span>
							<DatePicker
								value={f.next_due}
								onValueChange={(v) => set({ next_due: v ?? "" })}
							/>
						</div>
					</div>
					<div className="space-y-1.5">
						<span className={label}>Siklus</span>
						<div className="flex flex-wrap gap-1.5">
							{CYCLES.map(([v, t]) => (
								<button
									key={v}
									type="button"
									onClick={() => set({ cycle: v })}
									aria-pressed={f.cycle === v}
									className={cn(
										"h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
										f.cycle === v
											? "border-[#059669] bg-emerald-50 text-foreground"
											: "border-border-subtle text-muted-foreground hover:bg-secondary",
									)}
								>
									{t}
								</button>
							))}
						</div>
					</div>
					<div className="space-y-1.5">
						<span className={label}>Kategori di Catat</span>
						<Combobox
							value={f.category_id ?? ""}
							onValueChange={(v) => set({ category_id: v })}
							options={KELUAR_CATEGORIES.filter((c) =>
								c.coa.startsWith("5-"),
							).map((c) => ({ value: c.id, label: c.label }))}
							placeholder="Pilih kategori…"
							allowFreeText={false}
						/>
					</div>
					<div className="space-y-1.5">
						<span className={label}>Kata kunci di keterangan</span>
						<TextField
							value={f.match_keyword ?? ""}
							onChange={(e) => set({ match_keyword: e.target.value })}
							placeholder={f.name ? f.name.toLowerCase() : "mis. claude"}
						/>
						<p className="text-[11.5px] text-muted-foreground">
							Kosong = pakai nama tagihan.{" "}
							{f.category_id
								? `Catat bayar otomatis memakai kategori "${findCategory(f.category_id)?.label}".`
								: null}
						</p>
					</div>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose} disabled={pending}>
						Batal
					</Button>
					<Button onClick={simpan} disabled={pending || !f.name || !f.next_due}>
						Simpan
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
