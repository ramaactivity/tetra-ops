"use client";

import { Landmark, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";
import {
	Field,
	FormError,
	fieldInputClass,
	StatusToggle,
} from "@/components/catalog/form-kit";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { createBankAccount } from "@/lib/actions/bank-accounts";
import { cn } from "@/lib/utils";

/** Add a bank/cash account via modal (no page navigation). The ledger COA
 * code is auto-assigned server-side, so the form stays simple. */
export function AddBankAccountModal() {
	const router = useRouter();
	const formId = useId();
	const [open, setOpen] = useState(false);
	const [isDefault, setIsDefault] = useState(false);
	const [isActive, setIsActive] = useState(true);

	const [state, formAction, pending] = useActionState(
		createBankAccount,
		undefined,
	);

	// Close + refresh on success.
	useEffect(() => {
		if (state?.ok) {
			toast.success("Rekening tersimpan");
			setOpen(false);
			setIsDefault(false);
			setIsActive(true);
			router.refresh();
		}
	}, [state, router]);

	const err = (k: string) =>
		(state?.errors as Record<string, string[] | undefined> | undefined)?.[
			k
		]?.[0];

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!pending) setOpen(o);
			}}
		>
			<DialogTrigger className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#059669] px-3 text-sm font-medium text-white transition-colors hover:bg-[#047857] dark:bg-[#0b9e6a] dark:hover:bg-[#059669]">
				<Plus className="size-4" aria-hidden />
				Tambah Rekening
			</DialogTrigger>
			<DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<div className="bg-secondary text-muted-foreground mb-1 grid size-9 place-items-center rounded-xl">
						<Landmark className="size-4" aria-hidden />
					</div>
					<DialogTitle>Tambah Rekening</DialogTitle>
					<DialogDescription>
						Rekening bank atau kas baru. Kode akun (COA) di-assign otomatis.
					</DialogDescription>
				</DialogHeader>

				<form action={formAction} className="space-y-4">
					<FormError message={err("_form")} />

					<Field
						label="Nama Akun"
						name={`${formId}-account_name`}
						error={err("account_name")}
						required
					>
						<input
							id={`${formId}-account_name`}
							name="account_name"
							required
							defaultValue={state?.values?.account_name}
							placeholder='cth. "Bank BCA" / "Kas Tunai"'
							className={fieldInputClass}
						/>
					</Field>

					<div className="grid gap-4 sm:grid-cols-2">
						<Field
							label="Bank"
							name={`${formId}-bank_name`}
							error={err("bank_name")}
							required
						>
							<input
								id={`${formId}-bank_name`}
								name="bank_name"
								required
								defaultValue={state?.values?.bank_name}
								placeholder="BCA / Mandiri / Cash"
								className={fieldInputClass}
							/>
						</Field>

						<Field
							label="No. Rekening"
							name={`${formId}-account_number`}
							error={err("account_number")}
							hint="Opsional"
						>
							<input
								id={`${formId}-account_number`}
								name="account_number"
								inputMode="numeric"
								defaultValue={state?.values?.account_number}
								placeholder="1234567890"
								className={cn(fieldInputClass, "tabular")}
							/>
						</Field>
					</div>

					<Field
						label="Atas Nama"
						name={`${formId}-account_holder`}
						error={err("account_holder")}
						hint="Pemilik rekening (opsional)"
					>
						<input
							id={`${formId}-account_holder`}
							name="account_holder"
							defaultValue={state?.values?.account_holder}
							placeholder="Muhamad Ramadan Saputra"
							className={fieldInputClass}
						/>
					</Field>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-1.5">
							<span className="text-foreground text-sm font-medium">
								Default penerima
							</span>
							<input
								type="hidden"
								name="is_default_receive"
								value={isDefault ? "on" : ""}
							/>
							<StatusToggle
								active={isDefault}
								onChange={setIsDefault}
								activeLabel="Ya"
								inactiveLabel="Tidak"
								activeHint="Rekening utama"
								inactiveHint="Bukan default"
							/>
						</div>

						<div className="space-y-1.5">
							<span className="text-foreground text-sm font-medium">
								Status
							</span>
							<input
								type="hidden"
								name="is_active"
								value={isActive ? "on" : ""}
							/>
							<StatusToggle
								active={isActive}
								onChange={setIsActive}
								activeLabel="Aktif"
								inactiveLabel="Nonaktif"
								activeHint="Bisa dipakai"
								inactiveHint="Disembunyikan"
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
							disabled={pending}
						>
							Batal
						</Button>
						<Button type="submit" disabled={pending}>
							{pending ? "Menyimpan…" : "Simpan Rekening"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
