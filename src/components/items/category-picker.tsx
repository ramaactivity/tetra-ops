"use client";

import { Check, Package, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItemCategory } from "@/lib/inventory/item-loader";

type Card = {
	value: ItemCategory;
	title: string;
	subtitle: string;
	icon: React.ComponentType<{ className?: string }>;
	bullets: string[];
};

const CARDS: Card[] = [
	{
		value: "inventory",
		title: "Persediaan",
		subtitle: "Stok habis pakai",
		icon: Package,
		bullets: [
			"Berkurang otomatis tiap kali event berjalan",
			"Contoh: Mediaset, Sleeve, Flashdisk, Lakban",
		],
	},
	{
		value: "fixed_asset",
		title: "Aset Tetap",
		subtitle: "Peralatan kerja",
		icon: Video,
		bullets: [
			"Barang investasi jangka panjang, tidak habis setelah event",
			"Punya nomor seri (Serial Number) untuk dilacak lokasinya",
			"Contoh: Kamera, Lensa, Printer, Lighting",
		],
	},
];

export function CategoryPicker({
	selected,
	onChange,
}: {
	selected: ItemCategory | null;
	onChange: (category: ItemCategory) => void;
}) {
	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h2 className="text-base font-semibold">Pilih jenis item</h2>
				<p className="text-sm text-muted-foreground">
					Form di bawah otomatis menyesuaikan pilihan kamu.
				</p>
			</div>

			<div className="grid gap-4 sm:gap-5 md:grid-cols-2">
				{CARDS.map((c) => {
					const Icon = c.icon;
					const isSelected = selected === c.value;
					const isDimmed = selected !== null && !isSelected;
					return (
						<button
							key={c.value}
							type="button"
							onClick={() => onChange(c.value)}
							aria-pressed={isSelected}
							className={cn(
								"group relative cursor-pointer rounded-xl p-6 sm:p-7 text-left",
								"transition-all duration-200 ease-out",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
								// Default state — clearly defined surface
								"bg-surface-3 border",
								// Hover state — darker border + lift + shadow
								"hover:border-foreground/30 hover:shadow-sm hover:-translate-y-0.5",
								// Per-state overrides
								isSelected &&
									"border-2 border-foreground shadow-md -translate-y-0.5",
								!isSelected && "border-foreground/10",
								isDimmed && "opacity-50 hover:opacity-80",
							)}
						>
							{/* Selected checkmark — top right */}
							{isSelected && (
								<div className="absolute right-4 top-4 inline-flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow-sm">
									<Check className="size-3.5" strokeWidth={3} />
								</div>
							)}

							<div className="flex items-start gap-4">
								<div
									className={cn(
										"inline-flex size-12 shrink-0 items-center justify-center rounded-lg transition-colors",
										isSelected
											? "bg-foreground text-background"
											: "bg-surface-2 text-foreground/70 group-hover:bg-surface-1 group-hover:text-foreground",
									)}
								>
									<Icon className="size-6" />
								</div>
								<div className="min-w-0 flex-1 space-y-2">
									<div className="space-y-0.5">
										<div className="text-lg font-semibold leading-tight">
											{c.title}
										</div>
										<div className="text-[13px] text-muted-foreground">
											{c.subtitle}
										</div>
									</div>
									<ul className="space-y-1.5 pt-2 text-[13px] leading-relaxed text-muted-foreground">
										{c.bullets.map((b) => (
											<li key={b} className="flex items-start gap-2">
												<span className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-current opacity-50" />
												<span>{b}</span>
											</li>
										))}
									</ul>
								</div>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
