"use client";

import { ArrowDownToLine, Loader2, Paperclip, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { RichTextarea } from "@/components/ui/rich-textarea";
import { toast } from "@/components/ui/toaster";
import {
	recordOwnerWithdrawal,
	type WithdrawalFormState,
} from "@/lib/actions/owner-withdrawal";
import { formatRupiah } from "@/lib/format";

const TODAY = () => new Date().toISOString().slice(0, 10);

// Upload bukti transfer ke Drive + Arsip Nota, tertaut ke entry withdrawal.
async function uploadProof(
	file: File,
	refId: string,
	ownerName: string,
	amount: number,
): Promise<boolean> {
	try {
		const fd = new FormData();
		fd.set("file", file);
		fd.set("category", "Bagi hasil owner");
		fd.set("description", `Bagi hasil ${ownerName} · ${refId}`);
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
	balance: number;
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
	const [amountValue, setAmountValue] = useState("");
	// Bukti transfer: single = 1 file; bulk = per owner (ownerId → file).
	const [photo, setPhoto] = useState<File | null>(null);
	const [photosByOwner, setPhotosByOwner] = useState<Record<string, File>>({});
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
						if (f && !(await uploadProof(f, r.ref_id, r.full_name, r.amount)))
							failed++;
					}
				} else if (!isBulk && state.refId && photo) {
					const ok = await uploadProof(
						photo,
						state.refId,
						owner?.full_name ?? "Owner",
						Number(amountValue) || (owner?.balance ?? 0),
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
				setAmountValue("");
			}
		})();
	}, [state, isBulk, photo, photosByOwner, owner, amountValue]);

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
					<div className="bg-card border-border-default relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-[var(--shadow-level-5)]">
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
							className="space-y-4 overflow-y-auto px-6 py-5"
						>
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
											label: `${o.full_name} · sisa ${formatRupiah(o.balance)}`,
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
										Tiap owner ditarik penuh sesuai sisanya, dari rekening di
										bawah.
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

							<Field label="Bukti transfer (opsional)">
								<input
									name="withdrawal_reference"
									type="text"
									maxLength={120}
									placeholder="Bukti transfer ID, dll."
									className="border-border-default bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
								/>
							</Field>

							<Field label="Catatan" required>
								<RichTextarea
									name="description"
									required
									rows={2}
									maxLength={500}
									placeholder="Bagi hasil bulan ini, dll."
									toolbar={false}
								/>
							</Field>

							{isBulk ? (
								<div className="space-y-2">
									<span className="text-foreground block text-xs font-medium">
										Bukti transfer per owner (opsional)
									</span>
									<div className="space-y-2">
										{withdrawableOwners.map((o) => (
											<div
												key={o.id}
												className="border-border-default rounded-md border p-2.5"
											>
												<div className="mb-1.5 flex items-center justify-between gap-2">
													<span className="text-foreground text-[13px] font-medium">
														{o.full_name}
													</span>
													<span className="tabular text-muted-foreground text-xs">
														{formatRupiah(o.balance)}
													</span>
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
										Opsional — yang belum ada bisa dilampirkan nanti di Arsip
										Nota.
									</p>
								</div>
							) : (
								<Field label="Foto bukti transfer (opsional)">
									<ProofUpload file={photo} onChange={setPhoto} />
								</Field>
							)}

							{state?.error && (
								<div className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2">
									<p className="text-destructive text-xs font-medium">
										{state.error}
									</p>
								</div>
							)}

							<div className="border-border-default flex items-center justify-end gap-2 border-t pt-4">
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
						className="bg-surface-3 max-h-48 w-full object-contain"
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
		<label className="border-border-default hover:bg-secondary flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 text-[13px] text-muted-foreground">
			<Paperclip className="h-4 w-4" />
			<span>Lampirkan foto bukti transfer</span>
			<input
				type="file"
				accept="image/*,application/pdf"
				className="hidden"
				onChange={(e) => onChange(e.target.files?.[0] ?? null)}
			/>
		</label>
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
