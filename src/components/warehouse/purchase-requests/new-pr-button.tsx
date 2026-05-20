"use client";

import { Plus, ShoppingCart, Trash2 } from "lucide-react";
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
import { NumberField, TextareaField } from "@/components/ui/form-fields";
import { toast } from "@/components/ui/toaster";
import {
	createPurchaseRequest,
	type PRFormState,
} from "@/lib/actions/purchase-requests";

interface LineRow {
	id: string;
	item_id: string;
	qty_requested: string;
	unit: string;
	notes: string;
}

function newLine(): LineRow {
	return {
		id: crypto.randomUUID(),
		item_id: "",
		qty_requested: "",
		unit: "",
		notes: "",
	};
}

export interface PRItemOption {
	id: string;
	sku: string;
	name: string;
	unit: string;
}

export function NewPRButton({ items }: { items: PRItemOption[] }) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="press-down inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-fluid-caption font-medium text-primary-foreground hover:bg-primary/90"
			>
				<Plus className="size-4" />
				Buat Permintaan
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-4xl">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<ShoppingCart className="size-5 text-primary" />
							Buat Permintaan Belanja
						</DialogTitle>
						<DialogDescription>
							Owner akan terima notifikasi dan bisa beli + record lewat tombol
							Terima Item.
						</DialogDescription>
					</DialogHeader>
					<PRForm
						items={items}
						onSuccess={() => setOpen(false)}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}

function PRForm({
	items,
	onSuccess,
}: {
	items: PRItemOption[];
	onSuccess: () => void;
}) {
	const router = useRouter();
	const [lines, setLines] = useState<LineRow[]>([newLine()]);
	const [state, formAction, pending] = useActionState<PRFormState, FormData>(
		createPurchaseRequest,
		undefined,
	);

	useEffect(() => {
		if (state?.success) {
			toast.success("Permintaan dibuat");
			setLines([newLine()]);
			onSuccess();
			router.refresh();
		}
	}, [state, onSuccess, router]);

	const itemsById = useMemo(() => {
		const m = new Map<string, PRItemOption>();
		for (const it of items) m.set(it.id, it);
		return m;
	}, [items]);

	function updateLine(id: string, patch: Partial<LineRow>) {
		setLines((curr) =>
			curr.map((l) => (l.id === id ? { ...l, ...patch } : l)),
		);
	}
	function removeLine(id: string) {
		setLines((curr) => (curr.length > 1 ? curr.filter((l) => l.id !== id) : curr));
	}

	const validLines = lines.filter(
		(l) => l.item_id && Number(l.qty_requested) > 0,
	);

	const formError = state?.errors?._form?.[0];
	const itemsError = state?.errors?.items?.[0];

	return (
		<form
			action={(fd) => {
				fd.set(
					"items",
					JSON.stringify(
						validLines.map((l) => ({
							item_id: l.item_id,
							qty_requested: Number(l.qty_requested),
							unit: l.unit || itemsById.get(l.item_id)?.unit || "pcs",
							notes: l.notes || undefined,
						})),
					),
				);
				formAction(fd);
			}}
			className="space-y-4"
		>
			{formError && (
				<div className="rounded-md border border-destructive bg-destructive/10 p-3">
					<p className="text-sm font-medium text-destructive">{formError}</p>
				</div>
			)}

			<section className="space-y-2">
				<div className="flex items-center justify-between">
					<label className="text-sm font-medium">Daftar Bahan</label>
					<button
						type="button"
						onClick={() => setLines((l) => [...l, newLine()])}
						className="press-down inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2.5 text-[12px] font-medium hover:bg-surface-3"
					>
						<Plus className="size-3.5" /> Tambah Baris
					</button>
				</div>
				{itemsError && (
					<p className="text-xs text-destructive">{itemsError}</p>
				)}

				{/* Column headers (desktop only) */}
				<div className="hidden grid-cols-[minmax(0,2.4fr)_120px_80px_minmax(0,2fr)_36px] gap-2 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
					<span>Bahan</span>
					<span>Qty</span>
					<span>Unit</span>
					<span>Catatan</span>
					<span />
				</div>

				<div className="space-y-2">
					{lines.map((line) => {
						const item = itemsById.get(line.item_id);
						return (
							<div
								key={line.id}
								className="grid items-end gap-2 rounded-md border border-border-default bg-surface-2 p-2.5 lg:grid-cols-[minmax(0,2.4fr)_120px_80px_minmax(0,2fr)_36px] lg:items-center lg:p-2"
							>
								<Combobox
									id={`pr-item-${line.id}`}
									value={line.item_id}
									onValueChange={(v) => {
										const chosen = itemsById.get(v ?? "");
										updateLine(line.id, {
											item_id: v ?? "",
											unit: chosen?.unit ?? "",
										});
									}}
									options={items.map((i) => ({
										value: i.id,
										label: `${i.name} (${i.sku})`,
									}))}
									placeholder="Pilih bahan..."
									allowFreeText={false}
								/>
								<NumberField
									id={`pr-qty-${line.id}`}
									name={`pr-qty-${line.id}`}
									min={item?.unit === "roll" ? 0.01 : 1}
									step={item?.unit === "roll" ? 0.01 : 1}
									value={line.qty_requested}
									onChange={(e) =>
										updateLine(line.id, { qty_requested: e.target.value })
									}
									placeholder="0"
								/>
								<div className="flex h-10 items-center justify-center rounded-md border border-border-default bg-surface-1 px-2 text-[12px] text-muted-foreground">
									{line.unit || item?.unit || "—"}
								</div>
								<input
									type="text"
									value={line.notes}
									onChange={(e) =>
										updateLine(line.id, { notes: e.target.value })
									}
									placeholder="Catatan (opsional)"
									maxLength={200}
									className="h-10 rounded-md border border-border-default bg-surface-1 px-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
								/>
								<button
									type="button"
									onClick={() => removeLine(line.id)}
									disabled={lines.length === 1}
									title="Hapus baris"
									aria-label="Hapus baris"
									className="press-down inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
								>
									<Trash2 className="size-4" />
								</button>
							</div>
						);
					})}
				</div>
			</section>

			<div className="space-y-1.5">
				<label htmlFor="notes" className="text-sm font-medium">
					Catatan Permintaan
				</label>
				<TextareaField
					id="notes"
					name="notes"
					rows={2}
					maxLength={500}
					placeholder="opsional — mis. buat event Sabtu, urgent"
				/>
			</div>

			<DialogFooter>
				<button
					type="submit"
					disabled={pending || validLines.length === 0}
					className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
				>
					{pending
						? "Mengirim..."
						: `Kirim Permintaan (${validLines.length} bahan)`}
				</button>
			</DialogFooter>
		</form>
	);
}
