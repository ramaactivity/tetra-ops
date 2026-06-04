"use client";

import { BookOpen, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { NumberField } from "@/components/ui/form-fields";
import { toast } from "@/components/ui/toaster";
import {
	createManualJournalEntry,
	type ManualEntryFormState,
} from "@/lib/actions/journal-entries";
import { formatRupiah } from "@/lib/format";

export type CoaOption = {
	code: string;
	name: string;
	account_type: string;
};

const ENTRY_TYPE_OPTIONS: ReadonlyArray<{
	value: string;
	label: string;
}> = [
	{ value: "adjustment", label: "Adjustment / Koreksi" },
	{ value: "transfer", label: "Transfer (mis. kas → bank)" },
	{ value: "asset_in", label: "Aset masuk (mis. modal owner)" },
	{ value: "asset_out", label: "Aset keluar (mis. ambil tunai)" },
	{ value: "revenue", label: "Pendapatan (non-event)" },
	{ value: "expense", label: "Beban (non-event)" },
];

interface LineRow {
	id: string;
	account_code: string;
	debit: string;
	credit: string;
	description: string;
}

function newLine(): LineRow {
	return {
		id: crypto.randomUUID(),
		account_code: "",
		debit: "",
		credit: "",
		description: "",
	};
}

export function NewJournalEntryButton({ coa }: { coa: CoaOption[] }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [entryType, setEntryType] = useState<string>("adjustment");
	const [lines, setLines] = useState<LineRow[]>([newLine(), newLine()]);

	const [state, formAction, pending] = useActionState<
		ManualEntryFormState,
		FormData
	>(createManualJournalEntry, undefined);

	useEffect(() => {
		if (state?.success) {
			toast.success(
				state.refId ? `Jurnal disimpan — ${state.refId}` : "Jurnal disimpan",
			);
			setOpen(false);
			setEntryType("adjustment");
			setLines([newLine(), newLine()]);
			router.refresh();
		}
	}, [state, router]);

	const coaOptions = useMemo(
		() =>
			coa.map((c) => ({
				value: c.code,
				label: `${c.code} · ${c.name}`,
			})),
		[coa],
	);

	function updateLine(id: string, patch: Partial<LineRow>) {
		setLines((curr) => curr.map((l) => (l.id === id ? { ...l, ...patch } : l)));
	}
	function removeLine(id: string) {
		setLines((curr) =>
			curr.length > 2 ? curr.filter((l) => l.id !== id) : curr,
		);
	}

	const validLines = lines
		.map((l) => {
			const d = Number(l.debit);
			const c = Number(l.credit);
			return {
				...l,
				debit_amount: Number.isFinite(d) ? Math.floor(d) : 0,
				credit_amount: Number.isFinite(c) ? Math.floor(c) : 0,
			};
		})
		.filter(
			(l) =>
				l.account_code &&
				((l.debit_amount > 0 && l.credit_amount === 0) ||
					(l.credit_amount > 0 && l.debit_amount === 0)),
		);

	const totalDebit = validLines.reduce((s, l) => s + l.debit_amount, 0);
	const totalCredit = validLines.reduce((s, l) => s + l.credit_amount, 0);
	const isBalanced = totalDebit === totalCredit && totalDebit > 0;
	const selisih = totalDebit - totalCredit;

	const formError = state?.errors?._form?.[0];
	const lineError = state?.errors?.lines?.[0];

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="press-down inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90"
			>
				<Plus className="size-4" />
				Buat Entry Manual
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-5xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<BookOpen className="size-5 text-foreground" />
							Buat jurnal manual
						</DialogTitle>
						<DialogDescription>
							Untuk koreksi, setoran modal, atau transfer kas ↔ bank. Total
							debit harus sama dengan total kredit sebelum bisa disimpan.
						</DialogDescription>
					</DialogHeader>

					<form
						action={(fd) => {
							fd.set(
								"lines",
								JSON.stringify(
									validLines.map((l) => ({
										account_code: l.account_code,
										debit_amount: l.debit_amount,
										credit_amount: l.credit_amount,
										description: l.description || undefined,
									})),
								),
							);
							formAction(fd);
						}}
						className="space-y-4"
					>
						{formError && (
							<div className="rounded-md border border-destructive bg-destructive/10 p-3">
								<p className="text-sm font-medium text-destructive">
									{formError}
								</p>
							</div>
						)}

						{/* Header */}
						<section className="rounded-lg border border-border-default bg-secondary/40 p-3">
							<div className="eyebrow mb-2">Header entry</div>
							<div className="grid gap-3 lg:grid-cols-[180px_240px_1fr]">
								<Field label="Tanggal Entry" name="entry_date" required>
									<input
										type="date"
										id="entry_date"
										name="entry_date"
										defaultValue={new Date().toISOString().slice(0, 10)}
										required
										className="h-10 w-full rounded-md border border-border-default bg-surface-1 px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
									/>
								</Field>
								<Field label="Tipe Entry" name="entry_type" required>
									<Combobox
										id="entry_type"
										value={entryType}
										onValueChange={(v) => setEntryType(v ?? "adjustment")}
										options={ENTRY_TYPE_OPTIONS.map((o) => ({
											value: o.value,
											label: o.label,
										}))}
										allowFreeText={false}
									/>
									<input type="hidden" name="entry_type" value={entryType} />
								</Field>
								<Field
									label="Deskripsi"
									name="description"
									required
									hint="3-300 karakter — jelaskan transaksinya"
								>
									<input
										type="text"
										id="description"
										name="description"
										maxLength={300}
										required
										placeholder="mis. Setoran modal owner Rama"
										className="h-10 w-full rounded-md border border-border-default bg-surface-1 px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
									/>
								</Field>
							</div>
						</section>

						{/* Lines */}
						<section className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">Baris jurnal</span>
								<button
									type="button"
									onClick={() => setLines((l) => [...l, newLine()])}
									className="press-down inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-card px-2.5 text-[12px] font-medium hover:bg-secondary"
								>
									<Plus className="size-3.5" /> Tambah baris
								</button>
							</div>
							{lineError && (
								<p className="text-xs text-destructive">{lineError}</p>
							)}

							{/* Column headers */}
							<div className="hidden grid-cols-[minmax(0,2.4fr)_140px_140px_minmax(0,2fr)_36px] gap-2 px-2.5 lg:grid">
								<span className="eyebrow">Akun</span>
								<span className="eyebrow text-right">Debit</span>
								<span className="eyebrow text-right">Kredit</span>
								<span className="eyebrow">Keterangan (opsional)</span>
								<span />
							</div>

							<div className="space-y-2">
								{lines.map((line) => (
									<div
										key={line.id}
										className="grid items-end gap-2 rounded-md border border-border-default bg-surface-2 p-2.5 lg:grid-cols-[minmax(0,2.4fr)_140px_140px_minmax(0,2fr)_36px] lg:items-center lg:p-2"
									>
										<Combobox
											id={`acc-${line.id}`}
											value={line.account_code}
											onValueChange={(v) =>
												updateLine(line.id, { account_code: v ?? "" })
											}
											options={coaOptions}
											placeholder="Pilih akun..."
											allowFreeText={false}
										/>
										<div className="relative">
											<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
												Rp
											</span>
											<NumberField
												id={`debit-${line.id}`}
												name={`debit-${line.id}`}
												min={0}
												step={1}
												value={line.debit}
												onChange={(e) =>
													updateLine(line.id, {
														debit: e.target.value,
														// Auto-clear credit when typing debit
														credit: e.target.value ? "" : line.credit,
													})
												}
												placeholder="0"
												className="pl-8 text-right"
											/>
										</div>
										<div className="relative">
											<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
												Rp
											</span>
											<NumberField
												id={`credit-${line.id}`}
												name={`credit-${line.id}`}
												min={0}
												step={1}
												value={line.credit}
												onChange={(e) =>
													updateLine(line.id, {
														credit: e.target.value,
														debit: e.target.value ? "" : line.debit,
													})
												}
												placeholder="0"
												className="pl-8 text-right"
											/>
										</div>
										<input
											type="text"
											value={line.description}
											onChange={(e) =>
												updateLine(line.id, { description: e.target.value })
											}
											placeholder="mis. setoran kas owner"
											maxLength={200}
											className="h-10 w-full rounded-md border border-border-default bg-surface-1 px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
										/>
										<button
											type="button"
											onClick={() => removeLine(line.id)}
											disabled={lines.length <= 2}
											title="Hapus baris (min 2)"
											aria-label="Hapus baris"
											className="press-down inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
										>
											<Trash2 className="size-4" />
										</button>
									</div>
								))}
							</div>
						</section>

						{/* Balance preview */}
						<div
							className={`grid gap-3 rounded-lg border p-3 text-fluid-caption lg:grid-cols-3 ${
								totalDebit === 0 && totalCredit === 0
									? "border-border-default bg-surface-2/60"
									: isBalanced
										? "border-emerald-500/30 bg-emerald-500/5"
										: "border-rose-500/30 bg-rose-500/5"
							}`}
						>
							<div>
								<div className="eyebrow">Total debit</div>
								<div className="tabular text-fluid-h3 font-semibold text-foreground">
									{formatRupiah(totalDebit)}
								</div>
							</div>
							<div>
								<div className="eyebrow">Total kredit</div>
								<div className="tabular text-fluid-h3 font-semibold text-foreground">
									{formatRupiah(totalCredit)}
								</div>
							</div>
							<div className="lg:text-right">
								<div className="eyebrow">
									{isBalanced ? "Status" : "Selisih"}
								</div>
								<div
									className={`tabular text-fluid-h3 font-semibold ${
										isBalanced
											? "text-emerald-700 dark:text-emerald-400"
											: totalDebit === 0 && totalCredit === 0
												? "text-muted-foreground/40"
												: "text-destructive"
									}`}
								>
									{isBalanced
										? "✓ Seimbang"
										: totalDebit === 0 && totalCredit === 0
											? "—"
											: `${selisih > 0 ? "+" : ""}${formatRupiah(selisih)}`}
								</div>
							</div>
						</div>

						<DialogFooter>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="inline-flex h-10 items-center rounded-md border border-border-default bg-card px-4 text-sm font-medium hover:bg-secondary"
							>
								Batal
							</button>
							<button
								type="submit"
								disabled={pending || !isBalanced}
								title={
									!isBalanced
										? "Total debit harus sama dengan total kredit"
										: undefined
								}
								className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
							>
								{pending
									? "Menyimpan…"
									: isBalanced
										? `Simpan jurnal · ${formatRupiah(totalDebit)}`
										: "Belum seimbang"}
							</button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}

function Field({
	label,
	name,
	hint,
	required,
	children,
}: {
	label: string;
	name: string;
	hint?: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={name} className="text-sm font-medium">
				{label}
				{required && <span className="ml-0.5 text-primary">*</span>}
			</label>
			{children}
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}
