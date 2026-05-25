"use client";

import { useActionState, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import { recordWastage, type WastageFormState } from "@/lib/actions/wastage";
import { Field, inputClass } from "@/components/items/item-form-primitives";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

type InventoryItemOption = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	purchase_price_avg: number;
};

type SupplierOption = {
	id: string;
	name: string;
};

type EventOption = {
	id: string;
	project_id: string;
	client_name: string;
	event_date: string;
};

const REASON_OPTIONS = [
	{ value: "testing", label: "Testing — cetak tes sebelum event" },
	{
		value: "defective_on_arrival",
		label: "Defective on Arrival — rusak dari supplier",
	},
	{
		value: "handling_damage",
		label: "Handling Damage — sobek/penyok saat handle internal",
	},
	{ value: "production_reject", label: "Production Reject — gagal cetak" },
	{ value: "expired", label: "Expired — kadaluarsa" },
	{
		value: "customer_returned",
		label: "Customer Returned — dikembalikan klien",
	},
	{ value: "other", label: "Lainnya" },
];

export function WastageForm({
	items,
	suppliers,
	events,
}: {
	items: InventoryItemOption[];
	suppliers: SupplierOption[];
	events: EventOption[];
}) {
	const router = useRouter();
	const [state, formAction, pending] = useActionState<WastageFormState, FormData>(
		recordWastage,
		undefined,
	);

	const [itemId, setItemId] = useState<string>("");
	const [reason, setReason] = useState<string>("testing");
	const [eventId, setEventId] = useState<string>("");
	const [supplierId, setSupplierId] = useState<string>("");
	const [qty, setQty] = useState<string>("");

	const selectedItem = items.find((i) => i.id === itemId);
	const qtyNum = Number(qty);
	const estCost =
		Number.isFinite(qtyNum) && qtyNum > 0 && selectedItem
			? Math.round(qtyNum * selectedItem.purchase_price_avg)
			: 0;

	useEffect(() => {
		if (state?.success) {
			toast.success("Wastage tercatat");
			router.push("/warehouse/wastage");
		}
	}, [state, router]);

	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as
				| string[]
				| undefined
		)?.[0];

	return (
		<form action={formAction} className="space-y-5">
			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			<Field label="Item" name="item_id" error={err("item_id")} required>
				<Combobox
					id="item_id"
					value={itemId}
					onValueChange={(v) => setItemId(v ?? "")}
					options={items.map((i) => ({
						value: i.id,
						label: `${i.sku} — ${i.name}`,
					}))}
					placeholder="— pilih item persediaan —"
					allowFreeText={false}
				/>
				<input type="hidden" name="item_id" value={itemId} required />
			</Field>

			{selectedItem && (
				<div className="rounded-md bg-surface-1 px-3 py-2 text-[12px] text-muted-foreground">
					Avg cost saat ini:{" "}
					<strong className="tabular text-foreground">
						Rp {selectedItem.purchase_price_avg.toLocaleString("id-ID")} /{" "}
						{selectedItem.unit}
					</strong>
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Qty"
					name="qty_base"
					error={err("qty_base")}
					hint={
						selectedItem
							? `Dalam satuan base: ${selectedItem.unit}`
							: "Dalam unit base item"
					}
					required
				>
					<input
						type="number"
						name="qty_base"
						min={0.0001}
						step="any"
						required
						value={qty}
						onChange={(e) => setQty(e.target.value)}
						placeholder="0"
						className={`${inputClass} tabular`}
					/>
				</Field>

				<Field label="Alasan" name="reason" error={err("reason")} required>
					<NativeSelect
						value={reason}
						onValueChange={setReason}
						options={REASON_OPTIONS}
						triggerClassName="w-full"
					/>
					<input type="hidden" name="reason" value={reason} />
				</Field>
			</div>

			{estCost > 0 && (
				<div className="rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">
					Estimasi loss yang akan dijurnal:{" "}
					<strong className="tabular">
						Rp {estCost.toLocaleString("id-ID")}
					</strong>{" "}
					<span className="text-muted-foreground">
						(Dr 5-510 Beban Wastage / Cr Persediaan)
					</span>
				</div>
			)}

			<Field
				label="Detail / Konteks"
				name="reason_detail"
				error={err("reason_detail")}
				hint="Opsional — deskripsi singkat insiden"
			>
				<textarea
					name="reason_detail"
					rows={2}
					maxLength={500}
					placeholder="mis. 5 lembar sobek saat pasang ke printer; supplier ABC kirim defective…"
					className={`${inputClass} resize-none`}
				/>
			</Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field
					label="Event Terkait"
					name="event_id"
					error={err("event_id")}
					hint="Opsional — kalau wastage saat event tertentu"
				>
					<Combobox
						id="event_id"
						value={eventId}
						onValueChange={(v) => setEventId(v ?? "")}
						options={events.map((e) => ({
							value: e.id,
							label: `${e.project_id} — ${e.client_name}`,
						}))}
						placeholder="— tanpa event —"
						allowFreeText={false}
					/>
					<input type="hidden" name="event_id" value={eventId} />
				</Field>

				<Field
					label="Supplier"
					name="supplier_id"
					error={err("supplier_id")}
					hint={
						reason === "defective_on_arrival"
							? "Penting untuk track supplier quality"
							: "Opsional"
					}
				>
					<Combobox
						id="supplier_id"
						value={supplierId}
						onValueChange={(v) => setSupplierId(v ?? "")}
						options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
						placeholder="— tanpa supplier —"
						allowFreeText={false}
					/>
					<input type="hidden" name="supplier_id" value={supplierId} />
				</Field>
			</div>

			<Field
				label="URL Bukti Foto"
				name="evidence_url"
				error={err("evidence_url")}
				hint="Opsional — link Google Drive / S3 ke foto barang rusak"
			>
				<input
					type="url"
					name="evidence_url"
					placeholder="https://drive.google.com/…"
					className={inputClass}
				/>
			</Field>

			<div className="flex justify-end pt-2">
				<button
					type="submit"
					disabled={pending || !itemId || !qty}
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-4 text-sm font-medium disabled:opacity-60"
				>
					{pending ? "Menyimpan…" : "Catat Wastage"}
				</button>
			</div>
		</form>
	);
}
