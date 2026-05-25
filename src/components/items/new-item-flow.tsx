"use client";

import { useState } from "react";
import type { ItemCategory } from "@/lib/inventory/item-loader";
import { CategoryPicker } from "./category-picker";
import { FixedAssetItemForm } from "./fixed-asset-item-form";
import { InventoryItemForm } from "./inventory-item-form";

/**
 * Orchestrator: picker selalu visible (dengan selected state),
 * form muncul di bawah dengan fade-in saat user memilih kategori.
 */
export function NewItemFlow({
	returnTo,
}: {
	returnTo?: "/settings/items" | "/warehouse";
}) {
	const [category, setCategory] = useState<ItemCategory | null>(null);

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
							<InventoryItemForm mode="create" returnTo={returnTo} />
						) : (
							<FixedAssetItemForm mode="create" returnTo={returnTo} />
						)}
					</div>
				</div>
			)}
		</div>
	);
}
