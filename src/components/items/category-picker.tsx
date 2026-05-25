"use client";

import { Package, Video } from "lucide-react";
import type { ItemCategory } from "@/lib/inventory/item-loader";

type Card = {
	value: ItemCategory;
	title: string;
	subtitle: string;
	icon: React.ReactNode;
	bullets: string[];
};

const CARDS: Card[] = [
	{
		value: "inventory",
		title: "Persediaan",
		subtitle: "Barang habis pakai",
		icon: <Package className="size-6" />,
		bullets: [
			"Berkurang otomatis saat event jalan",
			"Masuk ke HPP (COGS) saat dikonsumsi",
			"Contoh: Mediaset, Sleeve, Flashdisk",
		],
	},
	{
		value: "fixed_asset",
		title: "Aktiva Tetap",
		subtitle: "Alat & gear tahan lama",
		icon: <Video className="size-6" />,
		bullets: [
			"Dikapitalisasi & disusutkan bertahap",
			"Punya nomor seri / asset number",
			"Contoh: Kamera, Printer, Lighting",
		],
	},
];

export function CategoryPicker({
	onChange,
}: {
	onChange: (category: ItemCategory) => void;
}) {
	return (
		<div className="space-y-4">
			<div className="space-y-1">
				<h2 className="text-lg font-semibold">Jenis item</h2>
				<p className="text-sm text-muted-foreground">
					Pilih dulu jenis item — sistem akan menyiapkan form yang sesuai
					dengan cara item ini di-track di akuntansi.
				</p>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				{CARDS.map((c) => (
					<button
						key={c.value}
						type="button"
						onClick={() => onChange(c.value)}
						className="group bg-surface-2 hover:bg-surface-1 focus-visible:ring-ring rounded-xl p-5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
					>
						<div className="flex items-start gap-3">
							<div className="bg-primary/10 text-primary group-hover:bg-primary/15 inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors">
								{c.icon}
							</div>
							<div className="min-w-0 flex-1 space-y-1">
								<div>
									<div className="text-base font-semibold">{c.title}</div>
									<div className="text-xs text-muted-foreground">
										{c.subtitle}
									</div>
								</div>
								<ul className="space-y-0.5 pt-1.5 text-[12px] text-muted-foreground">
									{c.bullets.map((b) => (
										<li key={b} className="flex items-start gap-1.5">
											<span className="text-foreground/40 mt-1.5 inline-block size-1 shrink-0 rounded-full bg-current" />
											<span>{b}</span>
										</li>
									))}
								</ul>
							</div>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}
