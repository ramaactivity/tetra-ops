"use client";

import { ArrowDownToLine, Loader2, Paperclip, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/month-picker";
import { NativeSelect } from "@/components/ui/native-select";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { toast } from "@/components/ui/toaster";
import {
	recordOwnerWithdrawal,
	type WithdrawalFormState,
} from "@/lib/actions/owner-withdrawal";
import { formatRupiah } from "@/lib/format";

const TODAY = () => new Date().toISOString().slice(0, 10);

const ID_MONTHS = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

// Default periode = bulan LALU (withdrawal dilakukan awal bulan untuk bagi hasil
// bulan sebelumnya). Format "YYYY-MM" untuk <input type="month">.
function prevMonthValue(): string {
	const d = new Date();
	d.setDate(1);
	d.setMonth(d.getMonth() - 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function thisMonthValue(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(value: string): string {
	const [y, m] = value.split("-").map(Number);
	if (!y || !m) return value;
	return `${ID_MONTHS[m - 1]} ${y}`;
}

// Upload bukti transfer ke Drive + Arsip Nota, tertaut ke entry withdrawal.
async function uploadProof(
	file: File,
	refId: string,
	ownerName: string,
	amount: number,
	periodLabel: string,
): Promise<boolean> {
	try {
		const fd = new FormData();
		fd.set("file", file);
		fd.set("category", "Bagi hasil owner");
		fd.set(
			"description",
			`Bagi hasil ${ownerName} · ${periodLabel} · ${refId}`,
		);
		fd.set("nota_date", TODAY());
		fd.set("amount", String(amount));
		fd.set("entry_ref_id", refId);
		const res = await fetch("/api/drive/upload/manual", {
			method: "POST",
			body: fd,
		});
		return res.ok;
	} catch {
		return false;
	}
}

export type Owner = {
	id: string;
	full_name: string;
	role: string;
	/** Yang boleh dicairkan sekarang (jatah bulan berjalan TIDAK termasuk). */
	balance: number;
	/** Jatah dari event bulan berjalan — tertahan sampai bulan depan. */
	pending?: number;
};

export type BankOption = {
	id: string;
	label: string;
};

// Sentinel "ambil semua owner sekaligus" (harus sama dgn owner-withdrawal.ts).
const ALL_OWNERS = "__ALL__";

export function WithdrawalButton({
	owners,
	banks,
	disabled,
}: {
	owners: Owner[];
	banks: BankOption[];
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [selectedOwner, setSelectedOwner] = useState<string>(
		owners[0]?.id ?? "",
	);
	const [selectedBank, setSelectedBank] = useState<string>(banks[0]?.id ?? "");
	const [period, setPeriod] = useState<string>(prevMonthValue());
	const [amountValue, setAmountValue] = useState("");
	// Bukti transfer: single = 1 file; bulk = per owner (ownerId → file).
	const [photo, setPhoto] = useState<File | null>(null);
	const [photosByOwner, setPhotosByOwner] = useState<Record<string, File>>({});
	// Ongkos transfer bank: beda rekening → beda ongkos, jadi disimpan per owner.
	const [adminFee, setAdminFee] = useState(0);
	const [feesByOwner, setFeesByOwner] = useState<Record<string, number>>({});
	const [uploading, setUploading] = useState(false);
	const [state, formAction, pending] = useActionState<
		WithdrawalFormState,
		FormData
	>(recordOwnerWithdrawal, undefined);
	const formRef = useRef<HTMLFormElement>(null);

	const isBulk = selectedOwner === ALL_OWNERS;
	// Total semua owner bersaldo positif (mode "ambil semua").
	const withdrawableOwners = owners.filter((o) => o.balance > 0);
	const grandTotal = withdrawableOwners.reduce((s, o) => s + o.balance, 0);
	const owner = isBulk
		? undefined
		: (owners.find((o) => o.id === selectedOwner) ?? owners[0]);
	const available = isBulk ? grandTotal : (owner?.balance ?? 0);
	// Jatah bulan berjalan yang sengaja belum boleh ditarik — ditampilkan supaya
	// angka "Bisa diambil" yang lebih kecil tidak terbaca sebagai data hilang.
	const pendingTotal = isBulk
		? owners.reduce((s, o) => s + (o.pending ?? 0), 0)
		: (owner?.pending ?? 0);
	const periodLabel = monthLabel(period);
	// Biaya admin ditanggung perusahaan (Dr 5-600): owner tetap terima penuh,
	// tapi kas yang keluar lebih besar dari jatahnya.
	const feeTotal = isBulk
		? withdrawableOwners.reduce((s, o) => s + (feesByOwner[o.id] ?? 0), 0)
		: adminFee;
	const cashOut = available + feeTotal;

	// Sukses → unggah bukti transfer (per owner) ke entry-nya, lalu tutup.
	// Dialog tetap terbuka + tombol terkunci selama upload (feedback jelas,
	// tak bisa dobel). Yang gagal/di-skip bisa dilampirkan lagi di Arsip Nota.
	const handledRef = useRef(false);
	useEffect(() => {
		if (!state?.ok || handledRef.current) return;
		handledRef.current = true;
		void (async () => {
			setUploading(true);
			let failed = 0;
			try {
				if (isBulk && state.refs) {
					for (const r of state.refs) {
						const f = photosByOwner[r.owner_user_id];
						if (
							f &&
							!(await uploadProof(
								f,
								r.ref_id,
								r.full_name,
								r.amount,
								periodLabel,
							))
						)
							failed++;
					}
				} else if (!isBulk && state.refId && photo) {
					const ok = await uploadProof(
						photo,
						state.refId,
						owner?.full_name ?? "Owner",
						Number(amountValue) || (owner?.balance ?? 0),
						periodLabel,
					);
					if (!ok) failed++;
				}
			} finally {
				setUploading(false);
				if (failed > 0) {
					toast.error(
						`${failed} bukti transfer gagal diunggah — bisa dilampirkan lagi di Arsip Nota`,
					);
				} else {
					toast.success("Bagi hasil tersimpan");
				}
				setOpen(false);
				formRef.current?.reset();
				setPhoto(null);
				setPhotosByOwner({});
				setAdminFee(0);
				setFeesByOwner({});
				setAmountValue("");
			}
		})();
	}, [state, isBulk, photo, photosByOwner, owner, amountValue, periodLabel]);

	// Reset guard tiap dialog dibuka lagi.
	useEffect(() => {
		if (open) handledRef.current = false;
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !uploading) setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, uploading]);

	const busy = pending || uploading;

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				disabled={disabled || owners.length === 0}
				className={buttonVariants({ variant: "outline", className: "h-9" })}
			>
				<ArrowDownToLine className="h-3.5 w-3.5" />
				Ambil bagi hasil
			</button>

			{open && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center px-4"
					role="dialog"
					aria-modal="true"
				>
					<button
						type="button"
						aria-label="Close"
						onClick={() => !busy && setOpen(false)}
						className="absolute inset-0 bg-black/40 backdrop-blur-sm"
					/>
					<div className="bg-card border-border-default relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border shadow-[var(--shadow-level-5)]">
						<div className="border-border-default flex shrink-0 items-start justify-between gap-3 border-b px-6 py-4">
							<div className="space-y-0.5">
								<h2 className="text-foreground text-base font-semibold">
									Ambil bagi hasil owner
								</h2>
								<p className="text-muted-foreground text-xs">
									Catat uang bagi hasil yang diambil owner. Sisa otomatis
									berkurang.
								</p>
							</div>
							<button
								type="button"
								onClick={() => setOpen(false)}
								disabled={busy}
								className="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-40"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						<form
							ref={formRef}
							action={formAction}
							className="flex min-h-0 flex-1 flex-col overflow-hidden"
						>
							<div className="grid min-h-0 flex-1 gap-x-8 gap-y-4 overflow-y-auto px-6 py-5 md:grid-cols-2">
								{/* KIRI — detail penarikan */}
								<div className="space-y-4">
									<Field label="Owner" required>
										<NativeSelect
											value={selectedOwner}
											onValueChange={setSelectedOwner}
											options={[
												...(withdrawableOwners.length > 1
													? [
															{
																value: ALL_OWNERS,
																label: `Semua owner (${withdrawableOwners.length}) · total ${formatRupiah(grandTotal)}`,
															},
														]
													: []),
												...owners.map((o) => ({
													value: o.id,
													label: `${o.full_name} · bisa diambil ${formatRupiah(o.balance)}`,
												})),
											]}
											triggerClassName="w-full"
										/>
										<input
											type="hidden"
											name="owner_user_id"
											value={selectedOwner}
											required
										/>
									</Field>

									<Field label="Periode bagi hasil" required>
										<MonthPicker
											value={period}
											onValueChange={setPeriod}
											className="border-border-default bg-background hover:bg-secondary/60 h-10 w-full justify-between rounded-md px-3 text-sm font-normal"
											quickActions={[
												{
													label: "Bulan ini",
													onSelect: () => setPeriod(thisMonthValue()),
													active: period === thisMonthValue(),
												},
												{
													label: "Bulan lalu",
													onSelect: () => setPeriod(prevMonthValue()),
													active: period === prevMonthValue(),
												},
											]}
										/>
										<input
											type="hidden"
											name="period_label"
											value={periodLabel}
										/>
										<p className="text-muted-foreground mt-1 text-[11px]">
											Bagi hasil dari event bulan {periodLabel}.
										</p>
									</Field>

									<div className="border-border-default bg-muted/30 rounded-md border px-3 py-2">
										<p className="text-muted-foreground text-[11px]">
											{isBulk
												? `Total semua owner (${withdrawableOwners.length})`
												: "Bisa diambil"}
										</p>
										<p
											className={`tabular text-lg font-semibold ${
												available > 0
													? "text-emerald-600 dark:text-emerald-400"
													: "text-muted-foreground"
											}`}
										>
											{formatRupiah(available)}
										</p>
										{isBulk && (
											<p className="text-muted-foreground mt-0.5 text-[11px]">
												Tiap owner ditarik penuh sesuai sisanya, dari rekening
												di bawah.
											</p>
										)}
										{feeTotal > 0 && (
											<p className="text-muted-foreground mt-1 text-[11px]">
												+ biaya admin{" "}
												<span data-nominal>{formatRupiah(feeTotal)}</span> → kas
												keluar{" "}
												<span data-nominal className="font-medium">
													{formatRupiah(cashOut)}
												</span>
											</p>
										)}
										{pendingTotal > 0 && (
											<p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
												{formatRupiah(pendingTotal)} dari event bulan ini belum
												ikut — baru bisa diambil bulan depan.
											</p>
										)}
									</div>

									{!isBulk && (
										<Field label="Jumlah diambil (Rp)" required>
											<input
												name="amount"
												type="number"
												required
												min="1"
												step="50000"
												max={owner?.balance ?? undefined}
												value={amountValue}
												onChange={(e) => setAmountValue(e.target.value)}
												placeholder="500000"
												className="border-border-default bg-background focus-visible:ring-ring tabular h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
											/>
										</Field>
									)}

									<Field label="Uang diambil dari (kas/bank)" required>
										<NativeSelect
											value={selectedBank}
											onValueChange={setSelectedBank}
											options={banks.map((b) => ({
												value: b.id,
												label: b.label,
											}))}
											triggerClassName="w-full"
										/>
										<input
											type="hidden"
											name="bank_account_id"
											value={selectedBank}
											required
										/>
									</Field>

									<div className="grid gap-3 sm:grid-cols-2">
										<Field label="Cara (transfer/tunai)" required>
											<WithdrawalMethodSelect />
										</Field>
										<Field label="No. rekening / detail">
											<input
												name="withdrawal_account"
												type="text"
												maxLength={120}
												placeholder="BCA xxx-xxx (opsional)"
												className="border-border-default bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
											/>
										</Field>
									</div>

									{!isBulk && (
										<div>
											<span className="text-foreground mb-1 block text-xs font-medium">
												Biaya admin bank (opsional)
											</span>
											<AdminFeeChips
												value={adminFee}
												onChange={setAdminFee}
												ariaLabel="Biaya admin transfer owner"
											/>
											<input type="hidden" name="admin_fee" value={adminFee} />
											<p className="text-muted-foreground mt-1 text-[11px]">
												Ongkos transfer ke rekening owner — jadi beban
												perusahaan (5-600), bukan potongan jatah owner.
											</p>
										</div>
									)}

									<Field label="Bukti transfer / ID (opsional)">
										<input
											name="withdrawal_reference"
											type="text"
											maxLength={120}
											placeholder="Bukti transfer ID, dll."
											className="border-border-default bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
										/>
									</Field>

									<Field label="Catatan tambahan (opsional)">
										<RichTextarea
											name="description"
											rows={2}
											maxLength={500}
											placeholder={`Otomatis tercatat "Bagi hasil ${periodLabel}". Tambah catatan lain di sini bila perlu.`}
											toolbar={false}
										/>
									</Field>
								</div>

								{/* KANAN — foto bukti transfer */}
								<div className="space-y-2">
									{isBulk ? (
										<>
											<span className="text-foreground block text-xs font-medium">
												Transfer per owner — biaya admin & bukti
											</span>
											<input
												type="hidden"
												name="admin_fees"
												value={JSON.stringify(feesByOwner)}
											/>
											<div className="grid gap-2 sm:grid-cols-2">
												{withdrawableOwners.map((o) => (
													<div
														key={o.id}
														className="border-border-default rounded-md border p-2.5"
													>
														<div className="mb-1.5 flex items-center justify-between gap-2">
															<span className="text-foreground truncate text-[13px] font-medium">
																{o.full_name}
															</span>
															<span className="tabular text-muted-foreground shrink-0 text-xs">
																{formatRupiah(o.balance)}
																{(feesByOwner[o.id] ?? 0) > 0 && (
																	<span className="text-amber-700 dark:text-amber-400">
																		{" "}
																		+ {formatRupiah(feesByOwner[o.id])}
																	</span>
																)}
															</span>
														</div>
														<div className="mb-2">
															<span className="text-muted-foreground mb-1 block text-[11px] font-medium">
																Biaya admin transfer
															</span>
															<AdminFeeChips
																value={feesByOwner[o.id] ?? 0}
																onChange={(v) =>
																	setFeesByOwner((prev) => {
																		const next = { ...prev };
																		if (v > 0) next[o.id] = v;
																		else delete next[o.id];
																		return next;
																	})
																}
																ariaLabel={`Biaya admin transfer ${o.full_name}`}
															/>
														</div>
														<ProofUpload
															file={photosByOwner[o.id] ?? null}
															onChange={(f) =>
																setPhotosByOwner((prev) => {
																	const next = { ...prev };
																	if (f) next[o.id] = f;
																	else delete next[o.id];
																	return next;
																})
															}
														/>
													</div>
												))}
											</div>
											<p className="text-muted-foreground text-[11px]">
												Ongkos transfer tiap owner bisa beda (sesama bank
												gratis, antar bank kena admin) — dibukukan sebagai beban
												5-600. Bukti transfer opsional, yang belum ada bisa
												dilampirkan nanti di Arsip Nota.
											</p>
										</>
									) : (
										<Field label="Foto bukti transfer (opsional)">
											<ProofUpload file={photo} onChange={setPhoto} />
										</Field>
									)}
								</div>
							</div>

							{/* FOOTER — full width, selalu terlihat */}
							<div className="border-border-default shrink-0 space-y-3 border-t px-6 py-4">
								{state?.error && (
									<div className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2">
										<p className="text-destructive text-xs font-medium">
											{state.error}
										</p>
									</div>
								)}
								{feeTotal > 0 && (
									<p className="text-muted-foreground text-[11px]">
										Kas keluar{" "}
										<span data-nominal className="text-foreground font-medium">
											{formatRupiah(cashOut)}
										</span>{" "}
										= bagi hasil{" "}
										<span data-nominal>{formatRupiah(available)}</span> + biaya
										admin bank{" "}
										<span data-nominal>{formatRupiah(feeTotal)}</span>
									</p>
								)}
								<div className="flex items-center justify-end gap-2">
									<button
										type="button"
										onClick={() => setOpen(false)}
										disabled={busy}
										className="text-muted-foreground hover:text-foreground h-9 px-3 text-xs font-medium disabled:opacity-50"
									>
										Batal
									</button>
									<button
										type="submit"
										disabled={busy || available === 0 || !selectedBank}
										className="bg-[#059669] dark:bg-[#0b9e6a] text-white hover:bg-[#047857] dark:hover:bg-[#059669] inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-xs font-semibold disabled:opacity-60"
									>
										{busy ? (
											<Loader2 className="h-3.5 w-3.5 animate-spin" />
										) : (
											<ArrowDownToLine className="h-3.5 w-3.5" />
										)}
										{uploading
											? "Mengunggah bukti…"
											: isBulk
												? `Ambil semua · ${formatRupiah(grandTotal)}`
												: "Ambil bagi hasil"}
									</button>
								</div>
							</div>
						</form>
					</div>
				</div>
			)}
		</>
	);
}

// Slot upload bukti transfer + preview (mirror engine catat transaksi).
function ProofUpload({
	file,
	onChange,
}: {
	file: File | null;
	onChange: (f: File | null) => void;
}) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		if (!file?.type.startsWith("image/")) {
			setUrl(null);
			return;
		}
		const u = URL.createObjectURL(file);
		setUrl(u);
		return () => URL.revokeObjectURL(u);
	}, [file]);

	if (file) {
		return (
			<div className="border-border-default overflow-hidden rounded-md border">
				{url ? (
					// biome-ignore lint/performance/noImgElement: preview object-URL lokal, bukan aset remote
					<img
						src={url}
						alt="Preview bukti transfer"
						className="bg-surface-3 max-h-32 w-full object-contain"
					/>
				) : null}
				<div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
					<span className="text-muted-foreground truncate text-[12px]">
						{file.name}
					</span>
					<button
						type="button"
						onClick={() => onChange(null)}
						className="text-rose-600 hover:bg-rose-50 inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium"
					>
						<X className="h-3.5 w-3.5" /> Hapus
					</button>
				</div>
			</div>
		);
	}
	return (
		<label className="border-border-default text-muted-foreground hover:border-border-strong hover:bg-secondary/60 flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-4 text-center transition-colors">
			<Paperclip className="h-5 w-5 opacity-60" />
			<span className="text-[12.5px] font-medium leading-tight">
				Lampirkan bukti transfer
			</span>
			<span className="text-[11px] opacity-70">Foto atau PDF</span>
			<input
				type="file"
				accept="image/*,application/pdf"
				className="hidden"
				onChange={(e) => onChange(e.target.files?.[0] ?? null)}
			/>
		</label>
	);
}

/**
 * Biaya admin bank per transfer — chip nominal yang paling sering (gratis
 * sesama bank, Rp2.500 BI-FAST, Rp6.500 antar bank) + isian bebas. Pola sama
 * dengan form fee crew, karena masalahnya sama: tiap penerima beda rekening.
 */
function AdminFeeChips({
	value,
	onChange,
	ariaLabel,
}: {
	value: number;
	onChange: (v: number) => void;
	ariaLabel: string;
}) {
	return (
		<div className="flex items-center gap-1.5">
			{[0, 2500, 6500].map((v) => (
				<button
					key={v}
					type="button"
					onClick={() => onChange(v)}
					className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[12px] font-medium ${
						value === v
							? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
							: "border-border-default bg-surface-1 text-muted-foreground hover:bg-surface-2"
					}`}
				>
					{v === 0 ? "Gratis" : <span data-nominal>{formatRupiah(v)}</span>}
				</button>
			))}
			<input
				type="number"
				inputMode="numeric"
				min={0}
				max={1000000}
				value={value === 0 ? "" : value}
				onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
				placeholder="lain"
				aria-label={ariaLabel}
				className="border-border-default bg-background focus-visible:ring-ring tabular h-9 w-full min-w-0 rounded-md border px-3 text-right text-[13px] focus-visible:ring-2 focus-visible:outline-none"
			/>
		</div>
	);
}

function WithdrawalMethodSelect() {
	const [method, setMethod] = useState("transfer");
	return (
		<>
			<NativeSelect
				value={method}
				onValueChange={setMethod}
				options={[
					{ value: "transfer", label: "Transfer" },
					{ value: "cash", label: "Tunai" },
				]}
				triggerClassName="w-full"
			/>
			<input type="hidden" name="withdrawal_method" value={method} required />
		</>
	);
}

function Field({
	label,
	required,
	children,
}: {
	label: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<label className="block space-y-1">
			<span className="text-foreground block text-xs font-medium">
				{label}
				{required && <span className="text-destructive ml-0.5">*</span>}
			</span>
			{children}
		</label>
	);
}
