"use client";

import { Wand2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
	Field,
	inputClass,
	SectionHeader,
} from "@/components/items/item-form-primitives";
import {
	type BundleFormState,
	createBundle,
	updateBundle,
} from "@/lib/actions/bundles";
import { generateInventorySku } from "@/lib/inventory/sku-generator";
import {
	type BundleComponentItem,
	BundleComponentPicker,
	type BundleComponentRow,
} from "./bundle-component-picker";

export type BundleDefaults = {
	name: string;
	sku: string;
	notes: string;
	is_active: boolean;
	components: BundleComponentRow[];
};

export const EMPTY_BUNDLE_DEFAULTS: BundleDefaults = {
	name: "",
	sku: "",
	notes: "",
	is_active: true,
	components: [],
};

function bundleSkuPreview(name: string): string {
	if (!name.trim()) return "";
	const gen = generateInventorySku(name);
	return gen.startsWith("ITM-")
		? gen.replace(/^ITM-/, "BUNDLE-")
		: `BUNDLE-${gen}`;
}

export function BundleForm({
	mode,
	id,
	defaults = EMPTY_BUNDLE_DEFAULTS,
	items,
}: {
	mode: "create" | "edit";
	id?: string;
	defaults?: BundleDefaults;
	items: BundleComponentItem[];
}) {
	const action =
		mode === "create" ? createBundle : updateBundle.bind(null, id ?? "");
	const [state, formAction, pending] = useActionState<BundleFormState, FormData>(
		action,
		undefined,
	);

	const err = (key: string) =>
		(
			state?.errors?.[key as keyof typeof state.errors] as
				| string[]
				| undefined
		)?.[0];

	const [name, setName] = useState<string>(state?.values?.name ?? defaults.name);
	const [skuOverride, setSkuOverride] = useState<string>(
		mode === "edit" ? defaults.sku : "",
	);
	const [skuEditable, setSkuEditable] = useState<boolean>(mode === "edit");
	const [components, setComponents] = useState<BundleComponentRow[]>(
		defaults.components,
	);
	const generatedSku = useMemo(() => bundleSkuPreview(name), [name]);
	const effectiveSku = skuEditable
		? skuOverride || generatedSku
		: generatedSku;

	return (
		<form action={formAction} className="space-y-6">
			<input type="hidden" name="return_to" value="/warehouse/bundles" />
			<input
				type="hidden"
				name="components"
				value={JSON.stringify(components)}
			/>

			{state?.errors?._form && (
				<div className="border-destructive bg-destructive/10 rounded-md border p-3">
					<p className="text-destructive text-sm font-medium">
						{state.errors._form[0]}
					</p>
				</div>
			)}

			{/* Identitas */}
			<div className="space-y-4">
				<SectionHeader title="Identitas Bundle" />

				<Field label="Nama Bundle" name="name" error={err("name")} required>
					<input
						type="text"
						name="name"
						required
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Set Kemasan Flashdisk, Bundle Photo Magnet Pro…"
						className={inputClass}
						autoFocus={mode === "create"}
					/>
				</Field>

				<div className="bg-surface-3 rounded-md px-3 py-2.5 text-[12px]">
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
								className="text-muted-foreground hover:text-foreground text-[11px] underline"
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

			{/* Komponen */}
			<div className="space-y-3">
				<SectionHeader
					title="Komponen"
					subtitle="List item yang dideduct saat bundle ini dipakai event. Hanya item yang flagged 'Bisa dipakai sebagai komponen Bundle' yang muncul."
				/>
				{err("components") && (
					<p className="text-destructive text-xs">{err("components")}</p>
				)}
				<BundleComponentPicker
					items={items}
					rows={components}
					onChange={setComponents}
				/>
				{items.length === 0 && (
					<div className="rounded-md bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-100">
						Belum ada item yang di-flag sebagai komponen Bundle. Buka tiap
						item di Warehouse → Edit → centang "Bisa dipakai sebagai komponen
						Bundle / Set".
					</div>
				)}
			</div>

			{/* Catatan + Aktif */}
			<Field
				label="Catatan"
				name="notes"
				error={err("notes")}
				hint="Opsional — info tambahan tentang bundle"
			>
				<textarea
					name="notes"
					rows={2}
					maxLength={500}
					defaultValue={defaults.notes}
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
					— bundle nonaktif tidak muncul di picker event
				</span>
			</label>

			<div className="flex justify-end pt-2">
				<button
					type="submit"
					disabled={pending || !name.trim() || components.length === 0}
					className="bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 inline-flex h-10 items-center rounded-md px-5 text-sm font-medium disabled:opacity-60"
				>
					{pending
						? "Menyimpan…"
						: mode === "create"
							? "Buat Bundle"
							: "Simpan perubahan"}
				</button>
			</div>
		</form>
	);
}
