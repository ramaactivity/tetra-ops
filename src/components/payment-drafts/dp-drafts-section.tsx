"use client";

import { Check, ImageUp, Loader2, Pencil, Send, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
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
import { MoneyInput, TextField } from "@/components/ui/form-fields";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import {
	batalkanDraft,
	gantiBuktiDraft,
	konfirmasiDraft,
	pilihanEventDraft,
	tandaiBukanEvent,
	ubahDraft,
} from "@/lib/actions/payment-drafts";
import { compressImage } from "@/lib/crew/image-compression";
import { cn } from "@/lib/utils";

/** Baris draft yang sudah diformat di server (tanggal WIB → tanpa hydration error). */
export type DraftView = {
	id: string;
	status: "menunggu" | "disetujui" | "tercatat" | "dibatalkan";
	nominal: number | null;
	nama_pengirim: string | null;
	bank_pengirim: string | null;
	bank_tujuan: string | null;
	bank_account_id: string | null;
	/** YYYY-MM-DD (WIB) — waktu transfer, cadangan waktu bukti diterima. */
	tanggal: string;
	tanggalLabel: string;
	hasBukti: boolean;
	/** Admin sudah membalas di WA tapi syarat otomatis tidak lolos. */
	alasanBelumOtomatis: string[];
	disetujuiVia: "admin_wa" | "app" | null;
	/** Alasan terakhir gagal masuk buku (lebih bayar, cutoff, …). */
	catatanPosting: string | null;
	/** Kuitansi pembayaran ini (setelah tercatat). */
	kuitansi: { id: string; nomor: string } | null;
	/** Usulan kuitansi lewat Hermes (null = belum dicoba). */
	kuitansiStatus: "dikabarkan_ke_hermes" | "belum_disiapkan" | null;
	/** Halaman Uang Masuk (lintas klien): untuk siapa bukti ini. */
	klien?: { nama: string; href: string | null } | null;
	/** Event klien sudah ada → konfirmasi langsung masuk buku. */
	adaEvent?: boolean;
	/** Sisa tagihan sebelum → sesudah bukti ini dicatat (negatif = lebih bayar). */
	sisa?: { sebelum: number; sesudah: number } | null;
	/** "DP" | "Cicilan" | "Pelunasan" — null kalau tagihan belum ketemu. */
	jenis?: string | null;
	/** Event yang sekarang ditautkan (dialog Ubah → "Untuk event"). */
	event?: { id: string; label: string } | null;
	/** Nama tidak tertera di bukti → saran dari klien/pemesan (Rama memilih). */
	saranPengirim?: string[];
};

export type BankOption = { value: string; label: string };

const STATUS: Record<DraftView["status"], { label: string; cls: string }> = {
	menunggu: {
		label: "Menunggu konfirmasi",
		cls: "bg-amber-100 text-amber-800",
	},
	disetujui: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-800" },
	tercatat: { label: "Tercatat", cls: "bg-emerald-600 text-white" },
	dibatalkan: {
		label: "Dibatalkan",
		cls: "bg-secondary text-muted-foreground",
	},
};

const rp = (n: number | null) => (n ? `Rp${n.toLocaleString("id-ID")}` : "—");
const sisaLabel = (n: number) =>
	n < 0 ? `lebih ${rp(-n)}` : n > 0 ? rp(n) : "lunas";

/**
 * Antrean bukti DP dari WA untuk satu Booking Masuk (DR-055). Draft tidak
 * menyentuh buku; yang disetujui masuk buku saat event dibuat.
 */
export function DpDraftsSection({
	drafts,
	banks,
	hasEvent,
	title = "Bukti transfer dari WA",
}: {
	drafts: DraftView[];
	banks: BankOption[];
	hasEvent: boolean;
	title?: string;
}) {
	const waiting = drafts.filter((d) => d.status === "menunggu").length;
	return (
		<section className="space-y-2 rounded-[16px] border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-1)]">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="text-[15px] font-semibold">{title}</h2>
				<p className="text-[12.5px] text-muted-foreground">
					{waiting > 0
						? `${waiting} menunggu konfirmasi`
						: hasEvent
							? "Semua sudah ditangani"
							: "Yang disetujui masuk buku saat event dibuat"}
				</p>
			</div>
			<div className="hidden grid-cols-[88px_120px_minmax(0,1.3fr)_minmax(0,1.4fr)_72px_minmax(0,1fr)] gap-3 border-b border-border-subtle pb-1.5 text-[12px] text-muted-foreground md:grid">
				<span>Tanggal</span>
				<span>Nominal masuk</span>
				<span>Nama pengirim</span>
				<span>Bank pengirim → tujuan</span>
				<span>Bukti</span>
				<span>Status</span>
			</div>
			<ul className="divide-y divide-border-subtle">
				{drafts.map((d) => (
					<DraftRow
						key={d.id}
						d={d}
						banks={banks}
						hasEvent={d.adaEvent ?? hasEvent}
					/>
				))}
			</ul>
		</section>
	);
}

function DraftRow({
	d,
	banks,
	hasEvent,
}: {
	d: DraftView;
	banks: BankOption[];
	hasEvent: boolean;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [pending, start] = useTransition();
	const [dialog, setDialog] = useState<"konfirmasi" | "ubah" | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const open = d.status === "menunggu" || d.status === "disetujui";
	const st = STATUS[d.status];
	const bankLine =
		[d.bank_pengirim, d.bank_tujuan].filter(Boolean).join(" → ") || "—";
	const jenis = d.jenis ? d.jenis.toLowerCase() : "transfer";

	async function batal() {
		const ok = await confirm({
			title: `Batalkan bukti ${jenis} ini?`,
			description: "Draft tetap tersimpan sebagai jejak dan tidak masuk buku.",
			confirmLabel: "Batalkan",
			variant: "destructive",
		});
		if (!ok) return;
		start(async () => {
			const res = await batalkanDraft(d.id);
			if (!res.ok) return void toast.error(res.error ?? res.warning);
			toast.success(`Bukti ${jenis} dibatalkan`);
			router.refresh();
		});
	}

	function gantiBukti(file: File) {
		start(async () => {
			const small = await compressImage(file, { targetMaxBytes: 900 * 1024 });
			const fd = new FormData();
			fd.set("id", d.id);
			fd.set("file", small);
			const res = await gantiBuktiDraft(fd);
			if (!res.ok) return void toast.error(res.error ?? res.warning);
			toast.success("Foto bukti diganti");
			router.refresh();
		});
	}

	return (
		<li className="py-2.5 md:grid md:grid-cols-[88px_120px_minmax(0,1.3fr)_minmax(0,1.4fr)_72px_minmax(0,1fr)] md:items-center md:gap-3">
			{/* HP: dua baris — angka + pengirim, lalu tanggal · bank · status. */}
			<span className="hidden text-[13px] text-muted-foreground md:block">
				{d.tanggalLabel}
			</span>
			<div className="flex items-baseline justify-between gap-2 md:contents">
				<span
					data-nominal
					className="tabular text-[15px] font-semibold md:text-[14px]"
				>
					{rp(d.nominal)}
				</span>
				<span
					className="min-w-0 truncate text-[14px] font-medium"
					title="Nama pemilik rekening pengirim — cocokkan dengan mutasi bank"
				>
					{d.nama_pengirim ?? (
						<span className="text-[13px] font-normal text-amber-700">
							Tidak tertera di bukti — isi dari mutasi
						</span>
					)}
				</span>
			</div>
			<p className="mt-0.5 truncate text-[12.5px] text-muted-foreground md:mt-0 md:text-[13px]">
				<span className="md:hidden">{d.tanggalLabel} · </span>
				{bankLine}
			</p>
			<span className="hidden md:block">
				{d.hasBukti ? (
					<a
						href={`/api/payment-drafts/${d.id}/bukti`}
						target="_blank"
						rel="noreferrer"
						className="text-[13px] font-medium text-link hover:underline"
					>
						Lihat
					</a>
				) : (
					<span className="text-[13px] text-muted-foreground">—</span>
				)}
			</span>
			<div className="mt-1.5 flex flex-wrap items-center gap-1.5 md:mt-0">
				{d.jenis ? (
					<span className="rounded-full bg-secondary px-2 py-0.5 text-[12px] font-medium text-foreground">
						{d.jenis}
					</span>
				) : null}
				<span
					className={cn(
						"rounded-full px-2 py-0.5 text-[12px] font-medium",
						st.cls,
					)}
				>
					{st.label}
					{d.status === "disetujui" && d.disetujuiVia === "admin_wa"
						? " · dari WA"
						: ""}
				</span>
				{d.hasBukti ? (
					<a
						href={`/api/payment-drafts/${d.id}/bukti`}
						target="_blank"
						rel="noreferrer"
						className="text-[12.5px] font-medium text-link hover:underline md:hidden"
					>
						Lihat bukti
					</a>
				) : null}
			</div>
			{d.klien || d.sisa ? (
				<p className="mt-1 text-[12.5px] text-muted-foreground md:col-span-6 md:mt-0 md:truncate">
					{d.klien ? (
						<>
							Untuk{" "}
							{d.klien.href ? (
								<a
									href={d.klien.href}
									className="font-medium text-foreground hover:underline"
								>
									{d.klien.nama}
								</a>
							) : (
								<span className="font-medium text-foreground">
									{d.klien.nama}
								</span>
							)}
						</>
					) : null}
					{d.klien && d.sisa ? " · " : null}
					{d.sisa ? (
						<>
							sisa tagihan{" "}
							<span data-nominal className="tabular">
								{rp(d.sisa.sebelum)}
							</span>{" "}
							→{" "}
							<span
								data-nominal
								className="tabular font-medium text-foreground"
							>
								{sisaLabel(d.sisa.sesudah)}
							</span>
						</>
					) : null}
				</p>
			) : null}
			{d.status === "menunggu" && d.alasanBelumOtomatis.length > 0 ? (
				<p className="mt-1 text-[12.5px] text-amber-800 md:col-span-6 md:mt-0">
					Admin sudah membalas di WA, tapi belum otomatis:{" "}
					{d.alasanBelumOtomatis.join("; ")}.
				</p>
			) : null}
			{d.catatanPosting && d.status !== "dibatalkan" ? (
				<p className="mt-1 text-[12.5px] text-red-700 md:col-span-6 md:mt-0">
					Belum masuk buku: {d.catatanPosting}
				</p>
			) : d.status === "disetujui" && !hasEvent ? (
				<p className="mt-1 text-[12.5px] text-muted-foreground md:col-span-6 md:mt-0">
					Masuk buku otomatis saat event dibuat.
				</p>
			) : null}
			{d.status === "tercatat" ? (
				<p className="mt-1 text-[12.5px] text-muted-foreground md:col-span-6 md:mt-0">
					Masuk buku.{" "}
					{d.kuitansi ? (
						<a
							href={`/finance/dokumen/${d.kuitansi.id}`}
							className="font-medium text-link hover:underline"
						>
							Kuitansi {d.kuitansi.nomor}
						</a>
					) : (
						"Kuitansi belum terbit — terbitkan dari halaman pembayaran event."
					)}
					{d.kuitansiStatus === "dikabarkan_ke_hermes"
						? " · usulan kirim sudah di Hermes"
						: null}
				</p>
			) : null}
			{d.status === "tercatat" && d.kuitansiStatus === "belum_disiapkan" ? (
				<p className="mt-1 text-[12.5px] text-amber-800 md:col-span-6 md:mt-0">
					Kuitansi belum disiapkan Hermes — tawaran kirim dikirim ke grup owner
					Telegram sebagai gantinya.
				</p>
			) : null}
			{open ? (
				<div className="mt-2 flex flex-wrap gap-1.5 md:col-span-6 md:mt-1">
					{d.status === "menunggu" ? (
						<Button
							size="sm"
							className="rounded-full"
							disabled={pending}
							onClick={() => setDialog("konfirmasi")}
						>
							<Check /> Konfirmasi
						</Button>
					) : null}
					<Button
						size="sm"
						variant="outline"
						className="rounded-full"
						disabled={pending}
						onClick={() => setDialog("ubah")}
					>
						<Pencil /> Ubah
					</Button>
					<Button
						size="sm"
						variant="outline"
						className="rounded-full"
						disabled={pending}
						onClick={() => fileRef.current?.click()}
					>
						{pending ? <Loader2 className="animate-spin" /> : <ImageUp />} Ganti
						bukti
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="rounded-full"
						disabled={pending}
						onClick={batal}
					>
						<XCircle /> Batalkan
					</Button>
					<input
						ref={fileRef}
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className="hidden"
						onChange={(e) => {
							const f = e.target.files?.[0];
							e.target.value = "";
							if (f) gantiBukti(f);
						}}
					/>
				</div>
			) : null}
			{dialog === "konfirmasi" ? (
				<KonfirmasiDialog
					d={d}
					banks={banks}
					hasEvent={hasEvent}
					onClose={() => setDialog(null)}
				/>
			) : null}
			{dialog === "ubah" ? (
				<UbahDialog d={d} banks={banks} onClose={() => setDialog(null)} />
			) : null}
		</li>
	);
}

function KonfirmasiDialog({
	d,
	banks,
	hasEvent,
	onClose,
}: {
	d: DraftView;
	banks: BankOption[];
	hasEvent: boolean;
	onClose: () => void;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [bank, setBank] = useState(d.bank_account_id ?? "");
	const [pending, start] = useTransition();
	const [kirimDipilih, setKirimDipilih] = useState(false);
	const lunas = d.sisa ? d.sisa.sesudah <= 0 : false;
	const dokumen = lunas ? "nota lunas" : "kuitansi";

	function submit(kirim: boolean) {
		setKirimDipilih(kirim);
		start(async () => {
			let res = await konfirmasiDraft(d.id, bank, false, kirim);
			if (!res.ok && res.warning) {
				const lanjut = await confirm({
					title: "Mungkin bukti dobel",
					description: res.warning,
					confirmLabel: "Tetap konfirmasi",
				});
				if (!lanjut) return;
				res = await konfirmasiDraft(d.id, bank, true, kirim);
			}
			if (!res.ok) return void toast.error(res.error ?? res.warning);
			toast.success(
				res.tercatat
					? kirim
						? `Masuk buku — ${dokumen} + ucapan terima kasih sedang dikirim ke klien`
						: `Masuk buku — ${dokumen} sudah terbit (belum dikirim)`
					: hasEvent
						? "Pembayaran disetujui"
						: "Disetujui — masuk buku saat event dibuat",
			);
			onClose();
			router.refresh();
		});
	}

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						Konfirmasi {d.jenis ?? "pembayaran"}{" "}
						<span data-nominal className="tabular">
							{rp(d.nominal)}
						</span>
					</DialogTitle>
					<DialogDescription>
						Dari rek. a.n. <b>{d.nama_pengirim ?? "—"}</b> · {d.tanggalLabel}
						{d.klien ? ` · untuk ${d.klien.nama}` : ""}. Cocokkan dengan mutasi
						bank dulu.
						{d.sisa ? (
							<>
								{" "}
								Sisa tagihan{" "}
								<span data-nominal className="tabular">
									{rp(d.sisa.sebelum)}
								</span>{" "}
								→{" "}
								<span data-nominal className="tabular">
									{sisaLabel(d.sisa.sesudah)}
								</span>
								.
							</>
						) : null}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-1.5">
					<Label>Masuk ke rekening</Label>
					<NativeSelect
						value={bank}
						onValueChange={setBank}
						options={banks}
						placeholder="Pilih rekening tujuan"
						aria-label="Rekening tujuan"
					/>
				</div>
				<DialogFooter>
					{hasEvent ? null : (
						<Button
							variant="outline"
							className="rounded-full"
							onClick={onClose}
							disabled={pending}
						>
							Batal
						</Button>
					)}
					{hasEvent ? (
						<>
							<Button
								variant="outline"
								className="rounded-full"
								onClick={() => submit(false)}
								disabled={pending || !bank || !d.nominal}
							>
								{pending && !kirimDipilih ? (
									<Loader2 className="animate-spin" />
								) : null}
								Konfirmasi saja
							</Button>
							<Button
								className="rounded-full"
								onClick={() => submit(true)}
								disabled={pending || !bank || !d.nominal}
							>
								{pending && kirimDipilih ? (
									<Loader2 className="animate-spin" />
								) : (
									<Send />
								)}{" "}
								Konfirmasi & kirim terima kasih
							</Button>
						</>
					) : (
						<Button
							className="rounded-full"
							onClick={() => submit(false)}
							disabled={pending || !bank || !d.nominal}
						>
							{pending ? <Loader2 className="animate-spin" /> : <Check />}{" "}
							Konfirmasi
						</Button>
					)}
				</DialogFooter>
				{hasEvent ? (
					<p className="text-[12.5px] text-muted-foreground">
						“Kirim terima kasih” = setelah masuk buku, {dokumen} langsung
						terkirim ke WA klien dengan pesan bahwa pembayarannya sudah kami
						terima.
					</p>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function UbahDialog({
	d,
	banks,
	onClose,
}: {
	d: DraftView;
	banks: BankOption[];
	onClose: () => void;
}) {
	const router = useRouter();
	const confirm = useConfirm();
	const [nominal, setNominal] = useState(d.nominal ?? 0);
	const [nama, setNama] = useState(d.nama_pengirim ?? "");
	const [bankDari, setBankDari] = useState(d.bank_pengirim ?? "");
	const [bankKe, setBankKe] = useState(d.bank_tujuan ?? "");
	const [tanggal, setTanggal] = useState(d.tanggal);
	const [rekening, setRekening] = useState(d.bank_account_id ?? "");
	const [eventId, setEventId] = useState(d.event?.id ?? "");
	const [events, setEvents] = useState<ComboboxOption[] | null>(null);
	const [pending, start] = useTransition();
	const jenis = d.jenis ? d.jenis.toLowerCase() : "transfer";

	// Daftar event dimuat saat dialog dibuka (disaring di Combobox).
	useEffect(() => {
		let aktif = true;
		pilihanEventDraft()
			.then((rows) => {
				if (!aktif) return;
				const opts = rows.map((r) => ({
					value: r.id,
					label: r.label,
					sublabel: r.sublabel,
				}));
				// Event yang sudah tertaut tetap muncul walau di luar 60 hari.
				if (d.event && !opts.some((o) => o.value === d.event?.id))
					opts.unshift({
						value: d.event.id,
						label: d.event.label,
						sublabel: "",
					});
				setEvents(opts);
			})
			.catch((e) => {
				if (aktif) {
					setEvents([]);
					toast.error(
						`Daftar event gagal dimuat: ${e instanceof Error ? e.message : e}`,
					);
				}
			});
		return () => {
			aktif = false;
		};
	}, [d.event]);

	function simpan() {
		start(async () => {
			const res = await ubahDraft(d.id, {
				nominal: nominal || null,
				nama_pengirim: nama,
				bank_pengirim: bankDari,
				bank_tujuan: bankKe,
				tanggal_transfer: tanggal || null,
				bank_account_id: rekening || null,
				...(eventId && eventId !== d.event?.id ? { event_id: eventId } : {}),
			});
			if (!res.ok) return void toast.error(res.error ?? res.warning);
			toast.success(
				d.status === "disetujui" &&
					(nominal !== d.nominal ||
						rekening !== (d.bank_account_id ?? "") ||
						(eventId && eventId !== d.event?.id))
					? "Disimpan — ada yang berubah, konfirmasi ulang"
					: "Disimpan",
			);
			onClose();
			router.refresh();
		});
	}

	async function bukanEvent() {
		const ok = await confirm({
			title: "Bukan pembayaran event?",
			description:
				"Bukti ini ditutup dan tidak masuk Billing. Kalau ini uang masuk lain (bukan dari klien acara), catat lewat Catat.",
			confirmLabel: "Ya, bukan pembayaran event",
		});
		if (!ok) return;
		start(async () => {
			const res = await tandaiBukanEvent(d.id);
			if (!res.ok) return void toast.error(res.error ?? res.warning);
			toast.success("Ditandai bukan pembayaran event");
			onClose();
			router.refresh();
		});
	}

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Ubah bukti {jenis}</DialogTitle>
					<DialogDescription>
						Isi sesuai mutasi bank, bukan sesuai bacaan foto.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1.5 sm:col-span-2">
						<Label>Untuk event</Label>
						<Combobox
							value={eventId}
							onValueChange={setEventId}
							options={events ?? []}
							allowFreeText={false}
							placeholder={
								events ? "Cari nama klien, tanggal, atau PRJ" : "Memuat event…"
							}
							disabled={!events}
							emptyMessage="Event tidak ketemu"
							aria-label="Untuk event"
							wrapOptions
						/>
						<p className="text-[12px] text-muted-foreground">
							{eventId
								? "Sisa tagihan & syarat dihitung ulang dari event ini setelah disimpan."
								: "Belum tertaut ke event — pilih supaya bisa dikonfirmasi ke tagihannya."}
						</p>
					</div>
					<div className="space-y-1.5">
						<Label>Nominal masuk</Label>
						<MoneyInput
							value={nominal}
							onValueChange={setNominal}
							aria-label="Nominal masuk"
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Tanggal transfer</Label>
						<DatePicker
							value={tanggal}
							onValueChange={setTanggal}
							aria-label="Tanggal transfer"
						/>
					</div>
					<div className="space-y-1.5 sm:col-span-2">
						<Label>Nama pemilik rekening pengirim</Label>
						<TextField
							value={nama}
							onChange={(e) => setNama(e.target.value)}
							placeholder="Tidak tertera di bukti — isi dari mutasi"
							aria-label="Nama pengirim"
						/>
						{!nama && d.saranPengirim?.length ? (
							<div className="flex flex-wrap items-center gap-1.5">
								<span className="text-[12px] text-muted-foreground">
									Mungkin:
								</span>
								{d.saranPengirim.map((n) => (
									<button
										key={n}
										type="button"
										onClick={() => setNama(n)}
										className="rounded-full border border-border-default px-2.5 py-0.5 text-[12px] font-medium hover:bg-secondary"
									>
										{n}
									</button>
								))}
							</div>
						) : null}
					</div>
					<div className="space-y-1.5">
						<Label>Bank pengirim</Label>
						<TextField
							value={bankDari}
							onChange={(e) => setBankDari(e.target.value)}
							aria-label="Bank pengirim"
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Tujuan (tertulis di bukti)</Label>
						<TextField
							value={bankKe}
							onChange={(e) => setBankKe(e.target.value)}
							aria-label="Bank tujuan"
						/>
					</div>
					<div className="space-y-1.5 sm:col-span-2">
						<Label>Masuk ke rekening</Label>
						<NativeSelect
							value={rekening}
							onValueChange={setRekening}
							options={banks}
							placeholder="Belum dipilih"
							aria-label="Rekening tujuan"
						/>
					</div>
				</div>
				<DialogFooter className="sm:justify-between">
					<Button
						variant="ghost"
						className="rounded-full text-muted-foreground"
						onClick={bukanEvent}
						disabled={pending}
					>
						Bukan pembayaran event
					</Button>
					<div className="flex flex-col-reverse gap-2 sm:flex-row">
						<Button
							variant="outline"
							className="rounded-full"
							onClick={onClose}
							disabled={pending}
						>
							Batal
						</Button>
						<Button
							className="rounded-full"
							onClick={simpan}
							disabled={pending}
						>
							{pending ? <Loader2 className="animate-spin" /> : <Check />}{" "}
							Simpan
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
