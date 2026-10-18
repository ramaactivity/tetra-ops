"use client";

import { Loader2, Paperclip, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TopbarActionPortal } from "@/components/layouts/topbar-action-portal";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import {
	catatTalanganOwner,
	lampirBuktiTalangan,
} from "@/lib/actions/uang-jalan";
import { KELUAR_CATEGORIES } from "@/lib/finance/quick-record-categories";
import { formatRupiah } from "@/lib/format";

type Account = { code: string; name: string; balance?: number };
type Jenis = "biaya" | "pinjaman" | "piutang";

const JENIS: Array<{ id: Jenis; label: string; hint: string }> = [
	{
		id: "biaya",
		label: "Owner bayarin biaya Tetra",
		hint: "Pakai uang pribadi owner. Biayanya masuk buku, Tetra berutang ke owner.",
	},
	{
		id: "pinjaman",
		label: "Owner pinjamkan uang",
		hint: "Uang owner masuk ke rekening Tetra. Tetra berutang ke owner.",
	},
	{
		id: "piutang",
		label: "Owner pinjam uang Tetra",
		hint: "Uang keluar dari rekening Tetra ke owner. Owner berutang ke Tetra.",
	},
];

// Kategori beban saja — yang menembak akun hutang (fee crew, komisi) bukan
// "biaya yang dibayarin owner".
const BIAYA = KELUAR_CATEGORIES.filter(
	(c) => c.entryType === "expense" && c.coa.startsWith("5-"),
);

const field =
	"h-10 w-full rounded-xl border border-border-default bg-background px-3 text-[13px]";

/**
 * Modul hutang-piutang owner: catat langsung (bukan dari acara) — biaya yang
 * dibayarin owner, pinjaman owner ke Tetra, atau owner pinjam uang Tetra.
 * Pelunasannya lewat kartu Hutang-piutang owner (sekaligus / dicicil).
 */
export function CatatTalanganOwner({
	owners,
	cashAccounts,
	inTopbar = false,
}: {
	/** Tombol ditaruh di topbar (halaman Hutang Owner), bukan di badan halaman. */
	inTopbar?: boolean;
	owners: Array<{ id: string; name: string }>;
	cashAccounts: Account[];
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [open, setOpen] = useState(false);
	const [ownerId, setOwnerId] = useState(owners[0]?.id ?? "");
	const [jenis, setJenis] = useState<Jenis>("biaya");
	const [amount, setAmount] = useState("");
	const [date, setDate] = useState(
		new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10),
	);
	const [note, setNote] = useState("");
	const [categoryId, setCategoryId] = useState("");
	const [account, setAccount] = useState(
		[...cashAccounts].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0]
			?.code ?? "",
	);
	const [file, setFile] = useState<File | null>(null);
	const nama = owners.find((o) => o.id === ownerId)?.name ?? "owner";

	const reset = () => {
		setAmount("");
		setNote("");
		setCategoryId("");
		setFile(null);
	};

	const submit = () =>
		start(async () => {
			const res = await catatTalanganOwner({
				ownerId,
				jenis,
				amount: Number(amount),
				date,
				note,
				categoryId: jenis === "biaya" ? categoryId : null,
				accountCode: jenis === "biaya" ? null : account,
			});
			if (!res.ok) return void toast.error(res.error);
			// Bukti → Arsip Nota (jalur unggah yang sama dengan Catat transaksi),
			// lalu ditempel ke jurnalnya.
			if (file) {
				const fd = new FormData();
				fd.set("file", file);
				fd.set(
					"category",
					jenis === "biaya"
						? (BIAYA.find((c) => c.id === categoryId)?.label ?? "Hutang owner")
						: "Hutang-piutang owner",
				);
				fd.set("description", `${note} · ${res.refId}`);
				fd.set("nota_date", date);
				fd.set("amount", amount);
				fd.set("entry_ref_id", res.refId);
				const up = await fetch("/api/drive/upload/manual", {
					method: "POST",
					body: fd,
				}).catch(() => null);
				const body = (await up?.json().catch(() => null)) as {
					url?: string;
				} | null;
				if (up?.ok && body?.url) await lampirBuktiTalangan(res.refId, body.url);
				else
					toast.error(
						"Catatan tersimpan, tapi buktinya gagal diunggah — unggah lewat Arsip Nota.",
					);
			}
			toast.success(res.note);
			reset();
			setOpen(false);
			router.refresh();
		});

	const valid =
		ownerId &&
		Number(amount) > 0 &&
		note.trim().length >= 3 &&
		(jenis === "biaya" ? !!categoryId : !!account);

	return (
		<>
			{inTopbar ? (
				// Aksi utama halaman Hutang Owner — di topbar, sama dengan Catat transaksi.
				<TopbarActionPortal>
					<button
						type="button"
						onClick={() => setOpen(true)}
						className="press-down inline-flex h-9 items-center gap-1.5 rounded-md bg-[#059669] px-3 text-fluid-caption font-medium text-white hover:bg-[#047857] dark:bg-[#0b9e6a] dark:hover:bg-[#059669]"
					>
						<Plus className="size-4" />
						<span className="sm:hidden">Catat</span>
						<span className="hidden sm:inline">Catat hutang / piutang</span>
					</button>
				</TopbarActionPortal>
			) : (
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-medium text-background"
				>
					<Plus className="size-4" /> Catat hutang / piutang
				</button>
			)}
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Catat hutang / piutang owner</DialogTitle>
						<DialogDescription>
							Dicatat dulu, dilunasi nanti sekalian atau dicicil dari kartu
							Hutang-piutang owner.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="space-y-1.5">
							<span className="text-[13px] font-medium">Owner</span>
							<div className="flex flex-wrap gap-1.5">
								{owners.map((o) => (
									<button
										key={o.id}
										type="button"
										aria-pressed={ownerId === o.id}
										onClick={() => setOwnerId(o.id)}
										className={`h-9 rounded-full border px-4 text-[13px] font-medium ${
											ownerId === o.id
												? "border-transparent bg-foreground text-background"
												: "border-border-default hover:bg-secondary"
										}`}
									>
										{o.name}
									</button>
								))}
							</div>
						</div>
						<div className="space-y-1.5">
							<span className="text-[13px] font-medium">Jenis</span>
							<div className="grid gap-1.5 sm:grid-cols-3">
								{JENIS.map((j) => (
									<button
										key={j.id}
										type="button"
										aria-pressed={jenis === j.id}
										onClick={() => setJenis(j.id)}
										className={`min-h-10 rounded-xl border px-3 py-2 text-left text-[12.5px] font-medium leading-snug ${
											jenis === j.id
												? "border-transparent bg-foreground text-background"
												: "border-border-default hover:bg-secondary"
										}`}
									>
										{j.label}
									</button>
								))}
							</div>
							<p className="type-caption text-muted-foreground">
								{JENIS.find((j) => j.id === jenis)?.hint.replaceAll(
									"owner",
									nama,
								)}
							</p>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="block space-y-1.5">
								<span className="text-[13px] font-medium">Jumlah</span>
								<div className="relative">
									<span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-muted-foreground">
										Rp
									</span>
									<input
										type="number"
										inputMode="numeric"
										min={1}
										value={amount}
										onChange={(e) => setAmount(e.target.value)}
										placeholder="100000"
										className={`${field} tabular pl-9`}
									/>
								</div>
							</label>
							<div className="space-y-1.5">
								<span className="text-[13px] font-medium">Tanggal</span>
								<DatePicker
									value={date}
									onValueChange={setDate}
									aria-label="Tanggal"
									className="h-10 w-full rounded-xl"
								/>
							</div>
						</div>
						{jenis === "biaya" ? (
							<div className="space-y-1.5">
								<span className="text-[13px] font-medium">Kategori biaya</span>
								<Combobox
									value={categoryId}
									onValueChange={(v) => setCategoryId(v ?? "")}
									options={BIAYA.map((c) => ({ value: c.id, label: c.label }))}
									placeholder="Pilih kategori"
									allowFreeText={false}
								/>
							</div>
						) : (
							<div className="space-y-1.5">
								<span className="text-[13px] font-medium">
									{jenis === "pinjaman"
										? "Masuk ke rekening"
										: "Keluar dari rekening"}
								</span>
								<NativeSelect
									value={account}
									onValueChange={setAccount}
									aria-label="Rekening"
									triggerClassName="h-10 w-full rounded-xl bg-background px-3 data-[size=default]:h-10"
									options={cashAccounts.map((a) => ({
										value: a.code,
										label: `${a.name}${a.balance !== undefined ? ` · ${formatRupiah(a.balance)}` : ""}`,
									}))}
								/>
							</div>
						)}
						<label className="block space-y-1.5">
							<span className="text-[13px] font-medium">Keterangan</span>
							<input
								type="text"
								value={note}
								maxLength={200}
								onChange={(e) => setNote(e.target.value)}
								placeholder={
									jenis === "biaya"
										? "Mis. beli kertas foto di Tokopedia"
										: jenis === "pinjaman"
											? "Mis. tambahan modal beli printer"
											: "Mis. pinjam buat bensin pribadi"
								}
								className={field}
							/>
						</label>
						<label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border-default px-3 text-[13px] text-muted-foreground hover:bg-secondary">
							<Paperclip className="size-4 shrink-0" />
							<span className="min-w-0 truncate">
								{file ? file.name : "Lampirkan bukti / nota (opsional)"}
							</span>
							<input
								type="file"
								accept="image/*,application/pdf"
								className="sr-only"
								onChange={(e) => setFile(e.target.files?.[0] ?? null)}
							/>
						</label>
					</div>
					<DialogFooter>
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="h-10 rounded-full px-4 text-[13px] font-medium hover:bg-secondary"
						>
							Batal
						</button>
						<button
							type="button"
							disabled={pending || !valid}
							onClick={submit}
							className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-[13px] font-medium text-background disabled:opacity-40"
						>
							{pending && <Loader2 className="size-4 animate-spin" />}
							Simpan
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
