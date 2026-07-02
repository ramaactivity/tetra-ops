"use client";

import { ArrowDownToLine, Loader2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { RichTextarea } from "@/components/ui/rich-textarea";
import {
	recordOwnerWithdrawal,
	type WithdrawalFormState,
} from "@/lib/actions/owner-withdrawal";
import { formatRupiah } from "@/lib/format";

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
	const [state, formAction, pending] = useActionState<
		WithdrawalFormState,
		FormData
	>(recordOwnerWithdrawal, undefined);
	const formRef = useRef<HTMLFormElement>(null);

	useEffect(() => {
		if (state?.ok) {
			setOpen(false);
			formRef.current?.reset();
		}
	}, [state?.ok]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	const isBulk = selectedOwner === ALL_OWNERS;
	// Total semua owner bersaldo positif (mode "ambil semua").
	const withdrawableOwners = owners.filter((o) => o.balance > 0);
	const grandTotal = withdrawableOwners.reduce((s, o) => s + o.balance, 0);
	const owner = isBulk
		? undefined
		: (owners.find((o) => o.id === selectedOwner) ?? owners[0]);
	const available = isBulk ? grandTotal : (owner?.balance ?? 0);

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
						onClick={() => setOpen(false)}
						className="absolute inset-0 bg-black/40 backdrop-blur-sm"
					/>
					<div className="bg-card border-border-default relative z-10 w-full max-w-lg overflow-hidden rounded-lg border shadow-[var(--shadow-level-5)]">
						<div className="border-border-default flex items-start justify-between gap-3 border-b px-6 py-4">
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
								className="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						<form
							ref={formRef}
							action={formAction}
							className="space-y-4 px-6 py-5"
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
									disabled={pending}
									className="text-muted-foreground hover:text-foreground h-9 px-3 text-xs font-medium disabled:opacity-50"
								>
									Batal
								</button>
								<button
									type="submit"
									disabled={pending || available === 0 || !selectedBank}
									className="bg-[#059669] dark:bg-[#0b9e6a] text-white hover:bg-[#047857] dark:hover:bg-[#059669] inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-xs font-semibold disabled:opacity-60"
								>
									{pending ? (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									) : (
										<ArrowDownToLine className="h-3.5 w-3.5" />
									)}
									{isBulk
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
