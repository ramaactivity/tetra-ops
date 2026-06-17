"use client";

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useActionState, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import {
	addManualMovement,
	type MovementFormState,
} from "@/lib/actions/sinking-funds";

export type BankOption = {
	id: string;
	bank_name: string;
	account_number: string | null;
	account_holder: string | null;
};

export function ManualMovementForm({
	fundId,
	fundName,
	bankAccounts,
}: {
	fundId: string;
	fundName: string;
	bankAccounts: BankOption[];
}) {
	const action = addManualMovement.bind(null, fundId);
	const [state, formAction, pending] = useActionState<
		MovementFormState,
		FormData
	>(action, undefined);

	const [type, setType] = useState<"deposit" | "withdrawal">("deposit");

	const get = (key: string, fallback?: string) =>
		state?.values?.[key] ?? fallback ?? "";
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as string[] | undefined
		)?.[0];

	return (
		<form action={formAction} className="space-y-4">
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<div className="border-border-default bg-muted/30 grid grid-cols-2 gap-1 rounded-md border p-1">
				<TypeOption
					selected={type === "deposit"}
					onClick={() => setType("deposit")}
					icon={<ArrowDownToLine className="h-4 w-4" />}
					label="Deposit"
					hint="Setor masuk"
					tone="emerald"
				/>
				<TypeOption
					selected={type === "withdrawal"}
					onClick={() => setType("withdrawal")}
					icon={<ArrowUpFromLine className="h-4 w-4" />}
					label="Withdrawal"
					hint="Tarik keluar"
					tone="rose"
				/>
			</div>
			<input type="hidden" name="movement_type" value={type} />

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Jumlah (Rp)" name="amount" error={err("amount")} required>
					<input
						type="number"
						name="amount"
						min={1}
						step={1}
						required
						defaultValue={get("amount")}
						placeholder="500000"
						className={`${inputClass} tabular`}
					/>
				</Field>

				{type === "withdrawal" ? (
					<Field
						label="Bank tujuan"
						name="target_bank_account_id"
						error={err("target_bank_account_id")}
						required
					>
						<BankSelect
							defaultValue={get("target_bank_account_id")}
							error={!!err("target_bank_account_id")}
							bankAccounts={bankAccounts}
						/>
					</Field>
				) : (
					<div />
				)}
			</div>

			<Field
				label="Deskripsi"
				name="description"
				error={err("description")}
				hint="Misal: setor manual dari kas, atau beli alat A"
				required
			>
				<input
					type="text"
					name="description"
					required
					maxLength={300}
					defaultValue={get("description")}
					placeholder={
						type === "deposit"
							? "Setoran manual dari Rama"
							: "Beli flashdisk batch baru"
					}
					className={inputClass}
				/>
			</Field>

			<div className="flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-xs">
					Fund: <span className="text-foreground font-medium">{fundName}</span>
				</p>
				<button
					type="submit"
					disabled={pending}
					className="bg-[#059669] dark:bg-[#0b9e6a] text-white hover:bg-[#047857] dark:hover:bg-[#059669] inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
				>
					{pending
						? "Menyimpan…"
						: type === "deposit"
							? "Catat deposit"
							: "Catat withdrawal"}
				</button>
			</div>
		</form>
	);
}

function BankSelect({
	defaultValue,
	error,
	bankAccounts,
}: {
	defaultValue: string;
	error: boolean;
	bankAccounts: Array<{
		id: string;
		bank_name: string;
		account_number: string | null;
		account_holder?: string | null;
	}>;
}) {
	const [bank, setBank] = useState(defaultValue);
	return (
		<>
			<NativeSelect
				value={bank}
				onValueChange={setBank}
				placeholder="Pilih bank…"
				options={bankAccounts.map((b) => ({
					value: b.id,
					label: `${b.bank_name}${b.account_number ? ` · ${b.account_number}` : ""}${b.account_holder ? ` · ${b.account_holder}` : ""}`,
				}))}
				triggerClassName="w-full"
				aria-invalid={error}
			/>
			<input
				type="hidden"
				name="target_bank_account_id"
				value={bank}
				required
			/>
		</>
	);
}

function TypeOption({
	selected,
	onClick,
	icon,
	label,
	hint,
	tone,
}: {
	selected: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
	hint: string;
	tone: "emerald" | "rose";
}) {
	const selectedClass =
		tone === "emerald"
			? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
			: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30";

	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onClick}
			className={`flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors ${
				selected ? selectedClass : "text-muted-foreground hover:bg-muted"
			}`}
		>
			<span className="flex items-center gap-2 text-sm font-medium">
				{icon}
				{label}
			</span>
			<span className="text-xs opacity-70">{hint}</span>
		</button>
	);
}

const inputClass =
	"border-border-default bg-background text-foreground focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none";
const selectClass = `${inputClass} appearance-none`;

function Field({
	label,
	name,
	hint,
	error,
	required,
	children,
}: {
	label: string;
	name: string;
	hint?: string;
	error?: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-sm font-medium">
				{label}
				{required && <span className="text-primary ml-0.5">*</span>}
			</label>
			{children}
			{error ? (
				<p className="text-destructive text-xs">{error}</p>
			) : hint ? (
				<p className="text-muted-foreground text-xs">{hint}</p>
			) : null}
		</div>
	);
}
