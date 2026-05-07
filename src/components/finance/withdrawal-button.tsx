"use client";

import { ArrowDownToLine, Loader2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
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

export function WithdrawalButton({
	owners,
	disabled,
}: {
	owners: Owner[];
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [selectedOwner, setSelectedOwner] = useState<string>(
		owners[0]?.id ?? "",
	);
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

	const owner = owners.find((o) => o.id === selectedOwner) ?? owners[0];

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				disabled={disabled || owners.length === 0}
				className="border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium"
			>
				<ArrowDownToLine className="h-3.5 w-3.5" />
				Record withdrawal
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
					<div className="bg-card border-border relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl">
						<div className="border-border flex items-start justify-between gap-3 border-b px-6 py-4">
							<div className="space-y-0.5">
								<h2 className="text-foreground text-base font-semibold">
									Record owner withdrawal
								</h2>
								<p className="text-muted-foreground text-xs">
									Catat pengambilan dari owner pool. Saldo otomatis berkurang.
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
								<select
									name="owner_user_id"
									required
									value={selectedOwner}
									onChange={(e) => setSelectedOwner(e.target.value)}
									className="border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
								>
									{owners.map((o) => (
										<option key={o.id} value={o.id}>
											{o.full_name} · saldo {formatRupiah(o.balance)}
										</option>
									))}
								</select>
							</Field>

							{owner && (
								<div className="border-border bg-muted/30 rounded-md border px-3 py-2">
									<p className="text-muted-foreground text-[11px]">
										Saldo tersedia
									</p>
									<p
										className={`tabular text-lg font-semibold ${
											owner.balance > 0
												? "text-emerald-600 dark:text-emerald-400"
												: "text-muted-foreground"
										}`}
									>
										{formatRupiah(owner.balance)}
									</p>
								</div>
							)}

							<Field label="Jumlah withdrawal (Rp)" required>
								<input
									name="amount"
									type="number"
									required
									min="1"
									step="50000"
									max={owner?.balance ?? undefined}
									placeholder="500000"
									className="border-border bg-background focus-visible:ring-ring tabular h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
								/>
							</Field>

							<div className="grid gap-3 sm:grid-cols-2">
								<Field label="Method" required>
									<select
										name="withdrawal_method"
										required
										defaultValue="transfer"
										className="border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
									>
										<option value="transfer">Transfer</option>
										<option value="cash">Cash</option>
									</select>
								</Field>
								<Field label="Account / detail">
									<input
										name="withdrawal_account"
										type="text"
										maxLength={120}
										placeholder="BCA xxx-xxx (opsional)"
										className="border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
									/>
								</Field>
							</div>

							<Field label="Reference (opsional)">
								<input
									name="withdrawal_reference"
									type="text"
									maxLength={120}
									placeholder="Bukti transfer ID, dll."
									className="border-border bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
								/>
							</Field>

							<Field label="Catatan" required>
								<textarea
									name="description"
									required
									rows={2}
									maxLength={500}
									placeholder="Withdraw bulan ini, dll."
									className="border-border bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
								/>
							</Field>

							{state?.error && (
								<div className="border-destructive/30 bg-destructive/10 rounded-md border px-3 py-2">
									<p className="text-destructive text-xs font-medium">
										{state.error}
									</p>
								</div>
							)}

							<div className="border-border flex items-center justify-end gap-2 border-t pt-4">
								<button
									type="button"
									onClick={() => setOpen(false)}
									disabled={pending}
									className="text-muted-foreground hover:text-foreground h-9 px-3 text-xs font-medium disabled:opacity-50"
								>
									Cancel
								</button>
								<button
									type="submit"
									disabled={pending || (owner?.balance ?? 0) === 0}
									className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-xs font-semibold disabled:opacity-60"
								>
									{pending ? (
										<Loader2 className="h-3.5 w-3.5 animate-spin" />
									) : (
										<ArrowDownToLine className="h-3.5 w-3.5" />
									)}
									Record withdrawal
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
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
