"use client";

import { Info, Pencil, Plus, Star, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Combobox } from "@/components/ui/combobox";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toaster";
import { MarketEntryDialog } from "@/components/warehouse/market-list/market-entry-dialog";
import type {
	MarketListEntry,
	MarketListItem,
} from "@/components/warehouse/market-list/market-list-table";
import {
	deleteSupplierPrice,
	setPrimarySupplierPrice,
} from "@/lib/actions/suppliers";
import { formatRupiah } from "@/lib/format";
import {
	createInventoryItem,
	type InventoryItemFormState,
	updateInventoryItem,
} from "@/lib/actions/items-inventory";
import { generateInventorySku } from "@/lib/inventory/sku-generator";
import { Field, inputClass, SectionHeader } from "./item-form-primitives";

export type SupplierOption = { id: string; name: string };

export type InventoryItemDefaults = {
	name: string;
	sku: string;
	base_unit: string;
	purchase_unit: string;
	conversion_factor: string;
	min_stock_alert: string;
	preferred_supplier_id: string;
	is_bom_component: boolean;
	notes: string;
	is_active: boolean;
	// Read-only avg cost (only meaningful on edit)
	purchase_price_avg?: number;
};

export const EMPTY_INVENTORY_DEFAULTS: InventoryItemDefaults = {
	name: "",
	sku: "",
	base_unit: "pcs",
	purchase_unit: "",
	conversion_factor: "",
	min_stock_alert: "0",
	preferred_supplier_id: "",
	is_bom_component: false,
	notes: "",
	is_active: true,
	purchase_price_avg: 0,
};

const UNIT_OPTIONS = [
	{ value: "pcs", label: "Pcs (Pieces)" },
	{ value: "box", label: "Box" },
	{ value: "pack", label: "Pack" },
	{ value: "roll", label: "Roll" },
	{ value: "sheet", label: "Sheet / Lembar" },
];

const PURCHASE_UNIT_OPTIONS = [
	{ value: "", label: "Sama dengan unit penggunaan" },
	...UNIT_OPTIONS,
];

export type InlineSupplierPriceRow = {
	id: string;
	supplier_id: string;
	supplier_name: string;
	pack_price: number;
	pack_size: number;
	pack_unit: string;
	is_primary: boolean;
	notes: string | null;
};

export type ItemContextForPricing = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	unit_conversion: unknown;
	purchase_price_avg: number;
};

export function InventoryItemForm({
	mode,
	id,
	defaults = EMPTY_INVENTORY_DEFAULTS,
	returnTo,
	suppliers = [],
	existingPrices = [],
	itemContext,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: InventoryItemDefaults;
	returnTo?: "/warehouse";
	suppliers?: SupplierOption[];
	/** Existing supplier prices for THIS item (edit mode only) */
	existingPrices?: InlineSupplierPriceRow[];
	/** Item context untuk MarketEntryDialog prefill (edit mode only) */
	itemContext?: ItemContextForPricing;
}) {
	const action =
		mode === "create"
			? createInventoryItem
			: updateInventoryItem.bind(null, id ?? "");
	const [state, formAction, pending] = useActionState<
		InventoryItemFormState,
		FormData
	>(action, undefined);

	const get = (key: keyof InventoryItemDefaults, fallback?: string) => {
		const v = state?.values?.[key as string];
		if (v !== undefined) return v;
		const def = defaults[key];
		return fallback ?? (typeof def === "boolean" ? "" : String(def ?? ""));
	};
	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as
				| string[]
				| undefined
		)?.[0];

	// State pieces driving auto-SKU + conversion display
	const [name, setName] = useState<string>(get("name"));
	const [skuOverride, setSkuOverride] = useState<string>(
		mode === "edit" ? defaults.sku : "",
	);
	const [skuEditable, setSkuEditable] = useState<boolean>(mode === "edit");
	const [baseUnit, setBaseUnit] = useState<string>(get("base_unit"));
	const [purchaseUnit, setPurchaseUnit] = useState<string>(get("purchase_unit"));
	const [conversionFactor, setConversionFactor] = useState<string>(
		get("conversion_factor"),
	);
	const [isBomComponent, setIsBomComponent] = useState<boolean>(
		state?.values?.is_bom_component !== undefined
			? state.values.is_bom_component === "on"
			: defaults.is_bom_component,
	);
	const [preferredSupplierId, setPreferredSupplierId] = useState<string>(
		get("preferred_supplier_id"),
	);

	const generatedSku = useMemo(
		() => (name.trim() ? generateInventorySku(name) : ""),
		[name],
	);
	const effectiveSku = skuEditable
		? skuOverride || generatedSku
		: generatedSku;

	const needsConversion = !!purchaseUnit && purchaseUnit !== baseUnit;
	const factorNum = Number(conversionFactor);
	const conversionPreview =
		needsConversion && Number.isFinite(factorNum) && factorNum > 0
			? `1 ${prettyUnit(purchaseUnit)} = ${factorNum.toLocaleString("id-ID")} ${prettyUnit(baseUnit)}`
			: null;

	return (
		<form action={formAction} className="space-y-6">
			{returnTo && <input type="hidden" name="return_to" value={returnTo} />}

			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			{/* ── Identitas ─────────────────────────────────────────────────── */}
			<div className="space-y-4">
				<SectionHeader title="Identitas" />

				<Field label="Nama Item" name="name" error={err("name")} required>
					<input
						type="text"
						name="name"
						required
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Mediaset Basic Roll, Sleeve 4R, Flashdisk 8GB…"
						className={inputClass}
						autoFocus={mode === "create"}
					/>
				</Field>

				{/* Auto-SKU preview */}
				<div className="rounded-md bg-surface-3 px-3 py-2.5 text-[12px]">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<Wand2 className="size-3.5 text-muted-foreground" />
							<span className="text-muted-foreground">SKU otomatis:</span>
							<span className="font-mono text-sm font-semibold text-foreground">
								{effectiveSku || "—"}
							</span>
						</div>
						{mode === "create" && (
							<button
								type="button"
								onClick={() => setSkuEditable((v) => !v)}
								className="text-[11px] text-muted-foreground underline hover:text-foreground"
							>
								{skuEditable ? "Pakai otomatis" : "Edit manual"}
							</button>
						)}
					</div>
					{skuEditable && mode === "create" && (
						<input
							type="text"
							value={skuOverride}
							onChange={(e) =>
								setSkuOverride(e.target.value.toUpperCase())
							}
							placeholder={generatedSku}
							className={`${inputClass} mt-2 font-mono uppercase`}
						/>
					)}
					{err("sku_override") && (
						<p className="text-destructive mt-1 text-[11px]">
							{err("sku_override")}
						</p>
					)}
					<input
						type="hidden"
						name="sku_override"
						value={skuEditable ? skuOverride : ""}
					/>
				</div>
			</div>

			{/* ── Unit & Konversi ──────────────────────────────────────────── */}
			<div className="space-y-4">
				<SectionHeader
					title="Unit & Konversi"
					subtitle="Beli dalam unit besar, pakai dalam unit kecil. Sistem otomatis konversi."
				/>

				<div className="grid gap-4 md:grid-cols-3">
					<Field
						label="Unit Penggunaan"
						name="base_unit"
						error={err("base_unit")}
						hint="Satuan terkecil saat dipakai event (yg dihitung di rekap)"
						required
					>
						<NativeSelect
							value={baseUnit}
							onValueChange={setBaseUnit}
							options={UNIT_OPTIONS}
							triggerClassName="w-full"
						/>
						<input type="hidden" name="base_unit" value={baseUnit} />
					</Field>

					<Field
						label="Unit Pembelian"
						name="purchase_unit"
						error={err("purchase_unit")}
						hint="Satuan saat beli ke supplier"
					>
						<NativeSelect
							value={purchaseUnit}
							onValueChange={setPurchaseUnit}
							options={PURCHASE_UNIT_OPTIONS}
							triggerClassName="w-full"
						/>
						<input type="hidden" name="purchase_unit" value={purchaseUnit} />
					</Field>

					<Field
						label="Faktor Konversi"
						name="conversion_factor"
						error={err("conversion_factor")}
						hint={
							needsConversion
								? `Berapa ${prettyUnit(baseUnit)} dalam 1 ${prettyUnit(purchaseUnit)}?`
								: "Tidak perlu kalau unit beli = unit pakai"
						}
					>
						<input
							type="number"
							name="conversion_factor"
							min={0.0001}
							step="any"
							value={conversionFactor}
							onChange={(e) => setConversionFactor(e.target.value)}
							disabled={!needsConversion}
							placeholder={needsConversion ? "1000" : "—"}
							className={`${inputClass} tabular`}
						/>
					</Field>
				</div>

				{conversionPreview && (
					<div className="rounded-md bg-sky-500/10 px-3 py-2 text-[12px] text-sky-900 dark:text-sky-100">
						<Info className="mr-1.5 inline size-3.5" />
						{conversionPreview}. Beli 5 {prettyUnit(purchaseUnit)} = otomatis +
						<strong className="tabular">
							{" "}
							{(factorNum * 5).toLocaleString("id-ID")} {prettyUnit(baseUnit)}
						</strong>{" "}
						stok.
					</div>
				)}
			</div>

			{/* ── Info: harga via Market List ────────────────────────────── */}
			<div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-3.5 py-2.5">
				<p className="text-[12px] leading-relaxed text-sky-800 dark:text-sky-200">
					<span className="font-semibold">💡 Harga &amp; supplier di Market List.</span>{" "}
					<span className="text-sky-700/80 dark:text-sky-300/80">
						Form ini cuma master item. Setelah Simpan, buka tab{" "}
						<strong>Market List</strong> untuk catat harga per supplier — harga
						otomatis sync ke Avg Cost di sini.
					</span>
				</p>
			</div>

			{/* ── Pengaturan Stok & Harga ─────────────────────────────────── */}
			<div className="space-y-4">
				<SectionHeader title="Pengaturan Stok" />

				<div className="grid gap-4 md:grid-cols-2">
					<Field
						label="Alert Stok Rendah"
						name="min_stock_alert"
						error={err("min_stock_alert")}
						hint="Notifikasi muncul kalau stok ≤ angka ini. 0 = matikan alert"
					>
						<input
							type="number"
							name="min_stock_alert"
							min={0}
							step={1}
							defaultValue={get("min_stock_alert")}
							className={`${inputClass} tabular`}
						/>
					</Field>

					<div className="space-y-1.5">
						<label className="text-sm font-medium">
							Average Cost (otomatis)
						</label>
						<div className="rounded-md bg-surface-3 px-3 py-2.5">
							<div className="tabular text-sm font-semibold text-foreground">
								Rp{" "}
								{(defaults.purchase_price_avg ?? 0).toLocaleString("id-ID")}{" "}
								<span className="text-muted-foreground font-normal">
									/ {prettyUnit(baseUnit)}
								</span>
							</div>
							<p className="text-muted-foreground mt-0.5 text-[11px]">
								Auto-sync dari supplier primary di <strong>Market List</strong>
								{" "}+ weighted-avg dari pembelian baru. Tidak perlu isi manual.
							</p>
						</div>
					</div>
				</div>
			</div>

			{/* ── Supplier Utama (Preferred Vendor) ─────────────────────── */}
			<Field
				label="Supplier Utama (Preferred Vendor)"
				name="preferred_supplier_id"
				error={err("preferred_supplier_id")}
				hint={
					suppliers.length === 0
						? "Belum ada supplier terdaftar."
						: "Auto-sync dari Market List primary supplier. Default pick saat Restock/Pembelian. Bisa override per transaksi."
				}
			>
				{suppliers.length === 0 ? (
					<div className="text-muted-foreground bg-surface-3 rounded-md px-3 py-2.5 text-[12px]">
						Belum ada supplier terdaftar.{" "}
						<Link
							href="/warehouse/suppliers"
							className="text-primary hover:underline"
						>
							Kelola di modul Supplier →
						</Link>
					</div>
				) : (
					<>
						<Combobox
							id="preferred_supplier_id"
							value={preferredSupplierId}
							onValueChange={(v) =>
								setPreferredSupplierId(v ?? "")
							}
							options={[
								{ value: "", label: "Pilih supplier (Opsional)" },
								...suppliers.map((s) => ({
									value: s.id,
									label: s.name,
								})),
							]}
							placeholder="Pilih supplier (Opsional)"
							allowFreeText={false}
						/>
						<input
							type="hidden"
							name="preferred_supplier_id"
							value={preferredSupplierId}
						/>
					</>
				)}
			</Field>

			{/* ── Harga & Supplier (Market List inline) ──────────────────── */}
			{mode === "edit" && itemContext && (
				<div className="space-y-3">
					<SectionHeader
						title="Harga & Supplier"
						subtitle="Catat semua supplier untuk item ini. ⭐ Primary = vendor yang harga drives Avg Cost. Auto-sync ke Persediaan + Rekap."
					/>
					<InlineSupplierPriceList
						item={itemContext}
						suppliers={suppliers}
						existingPrices={existingPrices}
					/>
				</div>
			)}

			{/* ── BOM Component toggle ────────────────────────────────────── */}
			<label className="bg-surface-3 flex cursor-pointer items-start gap-3 rounded-md p-3">
				<input
					type="checkbox"
					name="is_bom_component"
					checked={isBomComponent}
					onChange={(e) => setIsBomComponent(e.target.checked)}
					className="border-border-default accent-primary mt-0.5 h-4 w-4 rounded"
				/>
				<div className="space-y-0.5">
					<div className="text-sm font-medium">
						Bisa dipakai sebagai komponen Bundle / Set
					</div>
					<p className="text-muted-foreground text-[12px]">
						Centang kalau item ini akan jadi bagian dari paket combo
						(mis. FLASHDISK + FD-BOX + POUCH jadi "Set Flashdisk Kemasan").
						Modul Bundle akan filter picker pakai flag ini.
					</p>
				</div>
			</label>

			{/* ── Catatan ──────────────────────────────────────────────────── */}
			<Field
				label="Catatan"
				name="notes"
				error={err("notes")}
				hint="Opsional — spec, supplier rekomendasi, info handling"
			>
				<textarea
					name="notes"
					rows={2}
					maxLength={500}
					defaultValue={get("notes")}
					className={`${inputClass} resize-none`}
				/>
			</Field>

			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					name="is_active"
					defaultChecked={
						state?.values?.is_active !== undefined
							? state.values.is_active === "on"
							: defaults.is_active
					}
					className="border-border-default accent-primary h-4 w-4 rounded"
				/>
				<span className="font-medium">Aktif</span>
				<span className="text-muted-foreground text-xs">
					— item nonaktif tidak muncul di Warehouse / lookup
				</span>
			</label>

			<div className="flex items-center justify-end gap-3 pt-2">
				<p className="text-muted-foreground mr-auto text-[11px]">
					Akun akuntansi otomatis di-mapping (bisa di-edit Rama dari Finance).
				</p>
				<button
					type="submit"
					disabled={pending || !name.trim()}
					className="bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 inline-flex h-10 items-center rounded-md px-5 text-sm font-medium disabled:opacity-60"
				>
					{pending
						? "Menyimpan…"
						: mode === "create"
							? "Buat Persediaan"
							: "Simpan perubahan"}
				</button>
			</div>
		</form>
	);
}

function prettyUnit(u: string): string {
	if (!u) return "";
	if (u === "sheet") return "Lembar";
	return u.charAt(0).toUpperCase() + u.slice(1);
}

/**
 * Inline supplier prices section di Item edit page. Lists semua
 * supplier_prices untuk item ini + button add/edit/delete + star (primary
 * toggle). Reuses MarketEntryDialog dengan auto-prefill dari item config.
 *
 * Master Edit Page philosophy: user tidak perlu navigate ke Market List
 * untuk manage prices — semua di satu tempat.
 */
function InlineSupplierPriceList({
	item,
	suppliers,
	existingPrices,
}: {
	item: ItemContextForPricing;
	suppliers: SupplierOption[];
	existingPrices: InlineSupplierPriceRow[];
}) {
	const router = useRouter();
	const [editing, setEditing] = useState<{
		mode: "create" | "edit";
		entry?: MarketListEntry;
	} | null>(null);
	const [deleting, setDeleting] = useState<InlineSupplierPriceRow | null>(null);
	const [primaryPending, setPrimaryPending] = useState<string | null>(null);

	// Convert to MarketListItem shape needed by MarketEntryDialog
	const dialogItem: MarketListItem = {
		id: item.id,
		sku: item.sku,
		name: item.name,
		unit: item.unit,
		unit_conversion: item.unit_conversion as Record<string, number> | null,
		purchase_price_avg: item.purchase_price_avg,
		category: "inventory",
	};

	function rowToEntry(p: InlineSupplierPriceRow): MarketListEntry {
		return {
			id: p.id,
			supplier_id: p.supplier_id,
			supplier_name: p.supplier_name,
			item_id: item.id,
			pack_price: p.pack_price,
			pack_size: p.pack_size,
			pack_unit: p.pack_unit,
			is_primary: p.is_primary,
			notes: p.notes,
		};
	}

	async function handleSetPrimary(priceId: string, supplierName: string) {
		setPrimaryPending(priceId);
		try {
			await setPrimarySupplierPrice(priceId);
			toast.success(`${supplierName} di-set Primary — HPP synced`);
			router.refresh();
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Gagal set Primary";
			toast.error(msg);
		} finally {
			setPrimaryPending(null);
		}
	}

	return (
		<div className="space-y-3">
			{/* List */}
			{existingPrices.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border-default bg-surface-3/40 p-6 text-center">
					<p className="text-sm font-medium text-foreground">
						Belum ada supplier
					</p>
					<p className="mt-1 text-[12px] text-muted-foreground">
						Tambah supplier untuk catat harga belanja item ini.
					</p>
				</div>
			) : (
				<div className="space-y-1.5">
					{existingPrices.map((p) => {
						const effective =
							p.pack_size > 0 ? p.pack_price / p.pack_size : 0;
						return (
							<div
								key={p.id}
								className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
									p.is_primary
										? "border-amber-500/30 bg-amber-500/10"
										: "border-border-default bg-surface-3"
								}`}
							>
								{/* Star button (primary toggle) */}
								{p.is_primary ? (
									<Star
										className="size-4 shrink-0 fill-amber-500 text-amber-500"
										aria-label="Primary supplier"
									/>
								) : (
									<button
										type="button"
										onClick={() =>
											handleSetPrimary(p.id, p.supplier_name)
										}
										disabled={primaryPending === p.id}
										title="Tag sebagai Primary supplier"
										aria-label="Tag sebagai Primary supplier"
										className="press-down inline-flex size-5 items-center justify-center rounded text-muted-foreground/40 hover:bg-amber-500/10 hover:text-amber-600 disabled:opacity-50"
									>
										<Star className="size-3.5" />
									</button>
								)}

								{/* Supplier name + isi info */}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span
											className={`truncate text-[13px] ${p.is_primary ? "font-semibold text-foreground" : "font-medium text-foreground"}`}
										>
											{p.supplier_name}
										</span>
									</div>
									<div className="text-[11px] text-muted-foreground tabular">
										{p.pack_size.toLocaleString("id-ID")} {p.pack_unit} ×{" "}
										{formatRupiah(p.pack_price)}
									</div>
								</div>

								{/* Effective cost */}
								<div className="text-right">
									<div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
										Eff Cost
									</div>
									<div
										className={`tabular text-sm font-semibold whitespace-nowrap ${
											p.is_primary
												? "text-amber-700 dark:text-amber-300"
												: "text-foreground"
										}`}
									>
										{formatRupiah(Math.round(effective))}
										<span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
											/ {item.unit}
										</span>
									</div>
								</div>

								{/* Edit + Delete actions */}
								<div className="flex items-center gap-0.5">
									<button
										type="button"
										onClick={() =>
											setEditing({ mode: "edit", entry: rowToEntry(p) })
										}
										title="Edit harga"
										aria-label="Edit harga"
										className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
									>
										<Pencil className="size-3.5" />
									</button>
									<button
										type="button"
										onClick={() => setDeleting(p)}
										title="Hapus entry"
										aria-label="Hapus entry"
										className="press-down inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
									>
										<Trash2 className="size-3.5" />
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* Add button */}
			<button
				type="button"
				onClick={() => setEditing({ mode: "create" })}
				disabled={suppliers.length === 0}
				className="press-down inline-flex h-9 items-center gap-1.5 rounded-md border border-border-default bg-surface-2 px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-3 disabled:opacity-50"
			>
				<Plus className="size-3.5" />
				Tambah Supplier
			</button>

			{/* Modal: create / edit */}
			{editing && (
				<MarketEntryDialog
					open={!!editing}
					onOpenChange={(o) => !o && setEditing(null)}
					mode={editing.mode}
					item={dialogItem}
					entry={editing.entry}
					suppliers={suppliers}
				/>
			)}

			{/* Delete confirm */}
			<ConfirmDialog
				open={!!deleting}
				onOpenChange={(o) => !o && setDeleting(null)}
				title="Hapus entry harga?"
				description={
					deleting
						? `Entry "${deleting.supplier_name}" untuk item ini akan dihapus permanen.`
						: ""
				}
				confirmLabel="Hapus"
				variant="destructive"
				onConfirm={async () => {
					if (!deleting) return;
					try {
						await deleteSupplierPrice(deleting.id);
						toast.success("Entry dihapus");
						setDeleting(null);
						router.refresh();
					} catch (e) {
						const msg = e instanceof Error ? e.message : "Gagal hapus";
						toast.error(msg);
					}
				}}
			/>
		</div>
	);
}
