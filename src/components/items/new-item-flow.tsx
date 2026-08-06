"use client";

import { useState } from "react";
import type { ItemCategory } from "@/lib/inventory/item-loader";
import { CategoryPicker } from "./category-picker";
import { FixedAssetItemForm } from "./fixed-asset-item-form";
import { InventoryItemForm, type SupplierOption } from "./inventory-item-form";

/**
 * Orchestrator: picker selalu visible (dengan selected state),
 * form muncul di bawah dengan fade-in saat user memilih kategori.
 *
 * Pre-select via prop `initialCategory` — dipakai saat user klik
 * "Tambah Persediaan" / "Tambah Aset" dari tab-aware action button di
 * /warehouse, sehingga langsung skip picker step.
 */
export function NewItemFlow({
	returnTo,
	suppliers = [],
	initialCategory,
}: {
	returnTo?: "/warehouse";
	suppliers?: SupplierOption[];
	initialCategory?: ItemCategory;
}) {
	const [category, setCategory] = useState<ItemCategory | null>(
		initialCategory ?? null,
	);

	return (
		<div className="space-y-6">
			<CategoryPicker selected={category} onChange={setCategory} />

			{category && (
				<div
					key={category}
					className="duration-200 animate-in fade-in slide-in-from-top-2 fill-mode-both"
				>
					<div className="border-t border-foreground/[0.06] pt-6">
						{category === "inventory" ? (
							<InventoryItemForm
								mode="create"
								returnTo={returnTo}
								suppliers={suppliers}
							/>
						) : (
							<FixedAssetItemForm
								mode="create"
								returnTo={returnTo}
								suppliers={suppliers}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
