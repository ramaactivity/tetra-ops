import { ClipboardList } from "lucide-react";

/**
 * <CrewInputSummary /> — owner-facing reference card showing the RAW numbers
 * crew submitted, exactly as typed. Sits above the Ringkasan/Stok tabs so the
 * owner always has the source-of-truth input visible while reviewing the
 * derived deduction + HPP (which can diverge from a raw value on a manual
 * override). Makes a crew typo easy to spot at a glance.
 */
export function CrewInputSummary({
	rekap,
	customCount,
	submittedBy,
}: {
	rekap: {
		cetak_total: number;
		media_set_used: number;
		sleeve_used: number;
		flashdisk_used: number;
		pouch_used: number;
		photomagnet_used: number;
		keychain_used: number;
	};
	customCount: number;
	submittedBy?: string | null;
}) {
	const rows: Array<{ label: string; value: number; unit?: string }> = [
		{ label: "Total cetak", value: rekap.cetak_total, unit: "pcs" },
		{ label: "Mediaset", value: rekap.media_set_used, unit: "lembar" },
		{ label: "Sleeve", value: rekap.sleeve_used, unit: "pcs" },
		{ label: "Flashdisk", value: rekap.flashdisk_used },
		{ label: "Pouch", value: rekap.pouch_used },
		{ label: "Photomagnet", value: rekap.photomagnet_used },
		{ label: "Keychain", value: rekap.keychain_used },
		...(customCount > 0
			? [{ label: "Item tambahan", value: customCount }]
			: []),
	];

	return (
		<div className="rounded-xl border border-border-default bg-card p-4">
			<div className="flex items-center gap-2">
				<ClipboardList className="size-3.5 text-muted-foreground" aria-hidden />
				<h3 className="eyebrow text-muted-foreground">Input crew</h3>
				{submittedBy ? (
					<span className="text-[11px] text-muted-foreground/70">
						· oleh {submittedBy}
					</span>
				) : null}
			</div>
			<p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
				Angka mentah yang di-submit crew — cocokkan dengan deduksi &amp; HPP
				sebelum approve.
			</p>
			<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
				{rows.map((r) => (
					<div key={r.label} className="space-y-0.5">
						<dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
							{r.label}
						</dt>
						<dd className="tabular text-[15px] font-semibold leading-none text-foreground">
							{r.value.toLocaleString("id-ID")}
							{r.unit ? (
								<span className="ml-1 text-[11px] font-normal text-muted-foreground">
									{r.unit}
								</span>
							) : null}
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
