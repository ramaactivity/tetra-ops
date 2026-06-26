"use client";

import { useActionState, useState } from "react";
import {
	AddonComponentPicker,
	type AddonComponentRow,
} from "@/components/addons/addon-component-picker";
import {
	AffixInput,
	Field,
	FormDivider,
	FormError,
	FormSection,
	fieldInputClass,
	StatusToggle,
	StickyFormFooter,
} from "@/components/catalog/form-kit";
import { NativeSelect } from "@/components/ui/native-select";
import type { AddonFormState, AddonInput } from "@/lib/actions/addons";
import { ADDON_CATEGORY_LABELS } from "@/lib/format";

const CATEGORY_OPTIONS = Object.entries(ADDON_CATEGORY_LABELS);

type Action = (
	prev: AddonFormState,
	formData: FormData,
) => Promise<AddonFormState>;

export type AddonDefaults = Partial<{
	name: string;
	category: string;
	unit: string;
	price: number;
	requires_extra_crew: boolean;
	is_active: boolean;
}>;

export type InventoryItemOption = {
	id: string;
	sku: string;
	name: string;
	unit: string;
	purchase_price_avg: number;
};

export function AddonForm({
	action,
	defaults,
	inventoryItems = [],
	defaultComponents = [],
	submitLabel = "Save",
}: {
	action: Action;
	defaults?: AddonDefaults;
	inventoryItems?: InventoryItemOption[];
	defaultComponents?: AddonComponentRow[];
	submitLabel?: string;
}) {
	const [state, formAction, pending] = useActionState(action, undefined);
	const [components, setComponents] =
		useState<AddonComponentRow[]>(defaultComponents);
	const [isActive, setIsActive] = useState<boolean>(
		state?.values
			? state.values.is_active === "on"
			: (defaults?.is_active ?? true),
	);
	const [needsCrew, setNeedsCrew] = useState<boolean>(
		state?.values
			? state.values.requires_extra_crew === "on"
			: (defaults?.requires_extra_crew ?? false),
	);

	const get = (key: keyof AddonInput) =>
		state?.values?.[key] ??
		(
			defaults?.[key as keyof AddonDefaults] as string | number | undefined
		)?.toString() ??
		"";

	const err = (key: keyof AddonInput | "addon_components") =>
		state?.errors?.[key]?.[0];

	return (
		<form action={formAction} className="space-y-6">
			<FormError message={state?.errors?._form?.[0]} />

			<FormSection
				eyebrow="01 — Identitas"
				title="Nama & kategori"
				description="Nama add-on akan muncul di form booking saat dipilih."
			>
				<Field label="Nama Add-on" name="name" error={err("name")} required>
					<input
						id="name"
						type="text"
						name="name"
						required
						defaultValue={get("name")}
						placeholder="cth. Voucher Reprint 2R"
						className={fieldInputClass}
					/>
				</Field>

				<div className="grid gap-5 md:grid-cols-2">
					<Field
						label="Kategori"
						name="category"
						error={err("category")}
						required
					>
						<AddonCategorySelect
							defaultValue={get("category")}
							error={!!err("category")}
						/>
					</Field>

					<Field label="Unit" name="unit" error={err("unit")} required>
						<input
							id="unit"
							type="text"
							name="unit"
							required
							defaultValue={get("unit")}
							placeholder="pcs / jam / sesi"
							className={fieldInputClass}
						/>
					</Field>
				</div>
			</FormSection>

			<FormDivider />

			<FormSection
				eyebrow="02 — Harga & stok"
				title="Harga & inventory"
				description="Harga jual add-on, dan opsi link ke stok fisik untuk auto-deduct HPP."
			>
				<Field
					label="Harga"
					name="price"
					error={err("price")}
					hint="0 untuk add-on gratis"
					required
				>
					<AffixInput
						id="price"
						type="number"
						name="price"
						min={0}
						step={1}
						required
						defaultValue={get("price")}
						placeholder="50000"
						prefix="Rp"
						className="tabular"
					/>
				</Field>

				<Field
					label="Link ke stok (komponen)"
					name="addon_components"
					error={err("addon_components")}
					hint="Opsional. Item stok fisik yang dikonsumsi tiap 1 pesanan add-on ini — auto-deduct stok + masuk HPP saat rekap di-approve. Bisa lebih dari satu (cth. Guest Book = Scrapbook + Spidol)."
				>
					<AddonComponentPicker
						items={inventoryItems}
						rows={components}
						onChange={setComponents}
					/>
					<input
						type="hidden"
						name="addon_components"
						value={JSON.stringify(
							components
								.filter((r) => r.item_id && r.qty > 0)
								.map((r) => ({
									inventory_item_id: r.item_id,
									qty_per_unit: r.qty,
								})),
						)}
					/>
				</Field>
			</FormSection>

			<FormDivider />

			<FormSection
				eyebrow="03 — Operasional & visibilitas"
				title="Crew & status"
				description="Tandai kalau add-on perlu personel tambahan, dan atur visibilitasnya."
			>
				<input
					type="hidden"
					name="requires_extra_crew"
					value={needsCrew ? "on" : ""}
				/>
				<div className="space-y-1.5">
					<span className="text-foreground text-sm font-medium">
						Extra crew
					</span>
					<StatusToggle
						active={needsCrew}
						onChange={setNeedsCrew}
						activeLabel="Butuh crew"
						inactiveLabel="Tidak perlu"
						activeHint="Personel tambahan"
						inactiveHint="Crew standar"
					/>
				</div>

				<input type="hidden" name="is_active" value={isActive ? "on" : ""} />
				<div className="space-y-1.5">
					<span className="text-foreground text-sm font-medium">Status</span>
					<StatusToggle
						active={isActive}
						onChange={setIsActive}
						activeHint="Tampil di booking"
						inactiveHint="Disembunyikan"
					/>
				</div>
			</FormSection>

			<StickyFormFooter
				cancelHref="/operations/addons"
				submitLabel={submitLabel}
				pending={pending}
			/>
		</form>
	);
}

function AddonCategorySelect({
	defaultValue,
	error,
}: {
	defaultValue: string;
	error: boolean;
}) {
	const [category, setCategory] = useState(defaultValue);
	return (
		<>
			<NativeSelect
				value={category}
				onValueChange={setCategory}
				placeholder="Pilih kategori…"
				options={CATEGORY_OPTIONS.map(([value, label]) => ({
					value,
					label,
				}))}
				triggerClassName="w-full"
				aria-invalid={error}
			/>
			<input type="hidden" name="category" value={category} required />
		</>
	);
}
