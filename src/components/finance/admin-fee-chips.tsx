"use client";

import { formatRupiah } from "@/lib/format";

/**
 * Biaya admin bank per transfer — chip nominal yang paling sering (gratis
 * sesama bank, Rp2.500 BI-FAST, Rp6.500 antar bank) + isian bebas. Pola sama
 * dengan form fee crew, karena masalahnya sama: tiap penerima beda rekening.
 */
export function AdminFeeChips({
	value,
	onChange,
	ariaLabel,
	presets = [0, 2500, 6500],
}: {
	presets?: number[];
	value: number;
	onChange: (v: number) => void;
	ariaLabel: string;
}) {
	const isPreset = presets.includes(value);
	return (
		// flex-wrap + basis kecil pada isian bebas: kartu per-owner cuma seperempat
		// lebar dialog, dan baris kaku bikin isian "lain" menembus batas kartu
		// (tampak seperti chip terpotong di tepi kanan). Sekarang barisnya turun
		// sendiri saat sempit, bukan meluber.
		<div className="flex flex-wrap items-center gap-1.5">
			{presets.map((v) => (
				<button
					key={v}
					type="button"
					onClick={() => onChange(v)}
					className={`inline-flex h-8 shrink-0 items-center rounded-full border px-2.5 text-[12px] font-medium transition-colors ${
						value === v
							? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
							: "border-border-default bg-surface-1 text-muted-foreground hover:bg-surface-2"
					}`}
				>
					{v === 0 ? "Gratis" : <span data-nominal>{formatRupiah(v)}</span>}
				</button>
			))}
			<input
				type="number"
				inputMode="numeric"
				min={0}
				max={1000000}
				value={value === 0 ? "" : value}
				onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
				placeholder="lain"
				aria-label={ariaLabel}
				className={`border-border-default bg-background focus-visible:ring-ring tabular h-8 min-w-[4rem] flex-1 basis-16 rounded-full border px-2.5 text-right text-[12px] focus-visible:ring-2 focus-visible:outline-none ${
					value > 0 && !isPreset
						? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
						: ""
				}`}
			/>
		</div>
	);
}
