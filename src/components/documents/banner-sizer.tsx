"use client";

import { Ruler } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/form-fields";
import {
	type BannerPricing,
	bannerPrice,
	parseBannerSize,
	withBannerSize,
} from "@/lib/documents/banner-price";
import { formatRupiah } from "@/lib/format";

/**
 * Ukuran banner bebas di item dokumen: lebar × tinggi (cm) → harga
 * rekomendasi (rumus di Pengaturan › Sistem, kategori pricing). Modal tampil
 * karena editor dokumen hanya untuk owner; tidak pernah masuk PDF/pesan klien.
 * Harga akhir tetap bebas diubah di kolom harga.
 */
export function BannerSizer({
	name,
	includes,
	unitPrice,
	pricing,
	onApply,
}: {
	name: string;
	includes: string[];
	unitPrice: number;
	pricing: BannerPricing;
	onApply: (patch: {
		name: string;
		includes: string[];
		unit_price: number;
	}) => void;
}) {
	const parsed = parseBannerSize(name);
	const [w, setW] = useState(String(parsed?.w ?? 230));
	const [h, setH] = useState(String(parsed?.h ?? 230));
	const W = Math.round(Number(w) || 0);
	const H = Math.round(Number(h) || 0);
	const valid = W > 0 && H > 0;
	const r = bannerPrice(W, H, pricing);
	const applied =
		valid && parsed?.w === W && parsed?.h === H && unitPrice === r.recommended;

	return (
		<div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-secondary/60 px-3 py-2 text-[12.5px]">
			<span className="inline-flex items-center gap-1.5 font-medium text-foreground">
				<Ruler className="size-3.5 text-muted-foreground" aria-hidden />
				Ukuran banner
			</span>
			<span className="inline-flex items-center gap-1.5">
				<NumberField
					value={w}
					min={1}
					onChange={(e) => setW(e.target.value)}
					className="h-8 w-20 text-center"
					aria-label="Lebar banner (cm)"
				/>
				<span className="text-muted-foreground">×</span>
				<NumberField
					value={h}
					min={1}
					onChange={(e) => setH(e.target.value)}
					className="h-8 w-20 text-center"
					aria-label="Tinggi banner (cm)"
				/>
				<span className="text-muted-foreground">cm</span>
			</span>
			{valid ? (
				<>
					<span className="tabular text-muted-foreground">
						{r.areaM2.toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²
						· modal <span data-nominal>{formatRupiah(r.hpp)}</span>
					</span>
					<span className="tabular text-foreground">
						Rekomendasi <b data-nominal>{formatRupiah(r.recommended)}</b>
					</span>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="ml-auto rounded-full"
						disabled={applied}
						onClick={() =>
							onApply({
								name: parsed ? withBannerSize(name, W, H) : `${name} ${W}×${H}`,
								includes: includes.map((t) => withBannerSize(t, W, H)),
								unit_price: r.recommended,
							})
						}
					>
						{applied ? "Sudah dipakai" : "Pakai harga & ukuran"}
					</Button>
				</>
			) : null}
		</div>
	);
}
