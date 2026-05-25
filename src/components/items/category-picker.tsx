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
		<div className="space-y-3">
			<div className="space-y-1">
				<h2 className="text-base font-semibold">Pilih jenis item</h2>
				<p className="text-sm text-muted-foreground">
					Form di bawah otomatis menyesuaikan pilihan kamu.
				</p>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				{CARDS.map((c) => {
					const Icon = c.icon;
					const isSelected = selected === c.value;
					return (
						<button
							key={c.value}
							type="button"
							onClick={() => onChange(c.value)}
							aria-pressed={isSelected}
							className={cn(
								"group relative cursor-pointer rounded-xl p-5 text-left",
								"transition-all duration-150 ease-out",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								isSelected
									? "bg-surface-3 shadow-md ring-2 ring-foreground"
									: "bg-surface-2 ring-1 ring-foreground/[0.04] hover:bg-surface-3 hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/10",
							)}
						>
							{/* Selected checkmark — top right */}
							{isSelected && (
								<div className="absolute right-3 top-3 inline-flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow-sm">
									<Check className="size-3.5" strokeWidth={3} />
								</div>
							)}

							<div className="flex items-start gap-3">
								<div
									className={cn(
										"inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors",
										isSelected
											? "bg-foreground text-background"
											: "bg-primary/10 text-primary group-hover:bg-primary/15",
									)}
								>
									<Icon className="size-6" />
								</div>
								<div className="min-w-0 flex-1 space-y-1">
									<div>
										<div className="text-base font-semibold leading-tight">
											{c.title}
										</div>
										<div className="text-[12px] text-muted-foreground">
											{c.subtitle}
										</div>
									</div>
									<ul className="space-y-1 pt-1.5 text-[12px] leading-snug text-muted-foreground">
										{c.bullets.map((b) => (
											<li key={b} className="flex items-start gap-1.5">
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
