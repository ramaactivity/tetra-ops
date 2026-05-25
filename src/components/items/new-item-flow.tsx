"use client";

import { useState } from "react";
import type { ItemCategory } from "@/lib/inventory/item-loader";
import { CategoryPicker } from "./category-picker";
import { FixedAssetItemForm } from "./fixed-asset-item-form";
import { InventoryItemForm } from "./inventory-item-form";

/**
 * Orchestrator untuk create-item flow. Step 1: pilih kategori, Step 2:
 * isi form yang sesuai. Tidak ada submit di Step 1 — itu cuma toggle state
 * client-side.
 */
export function NewItemFlow({
	returnTo,
}: {
	returnTo?: "/settings/items" | "/warehouse";
}) {
	const [category, setCategory] = useState<ItemCategory | null>(null);

	if (category === null) {
		return <CategoryPicker onChange={setCategory} />;
	}

	if (category === "inventory") {
		return (
			<div className="space-y-4">
				<CategoryBadge label="Persediaan" />
				<InventoryItemForm
					mode="create"
					returnTo={returnTo}
					onBack={() => setCategory(null)}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<CategoryBadge label="Aktiva Tetap" />
			<FixedAssetItemForm
				mode="create"
				returnTo={returnTo}
				onBack={() => setCategory(null)}
			/>
		</div>
	);
}

function CategoryBadge({ label }: { label: string }) {
	return (
		<div className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
			<span className="size-1.5 rounded-full bg-current" />
			{label}
		</div>
	);
}
