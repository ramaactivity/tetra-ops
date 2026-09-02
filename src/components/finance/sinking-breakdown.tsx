import Link from "next/link";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Rincian dana cadangan — ke mana saja uang yang disisihkan itu pergi.
 *
 * Di Ringkasan, dana cadangan cuma tampil sebagai satu angka gabungan. Angka
 * itu tidak menjawab pertanyaan yang sebenarnya: dana mana yang sudah cukup
 * dan mana yang masih jauh dari target. Panel ini yang menjawabnya, sekaligus
 * menyebut aturan pembagiannya supaya jelas kenapa satu dana tumbuh lebih
 * cepat dari yang lain.
 */

export type SinkingFundRow = {
	id: string;
	code: string;
	name: string;
	description: string | null;
	allocationType: "percentage" | "flat" | null;
	allocationValue: number | null;
	targetBalance: number | null;
	balance: number;
};

/** "5% dari laba tiap event" / "Rp100.000 tiap event". */
function allocationLabel(f: SinkingFundRow): string | null {
	if (f.allocationValue == null || f.allocationValue <= 0) return null;
	if (f.allocationType === "percentage") {
		return `${f.allocationValue}% dari laba tiap event`;
	}
	if (f.allocationType === "flat") {
		return `${formatRupiah(f.allocationValue)} tiap event`;
	}
	return null;
}

export function SinkingBreakdown({
	funds,
	total,
}: {
	funds: SinkingFundRow[];
	total: number;
}) {
	if (funds.length === 0) return null;

	return (
		<div className="space-y-3">
			{funds.map((f) => {
				// Porsi terhadap seluruh dana cadangan — menjawab "uang cadangan
				// saya sebenarnya menumpuk di mana".
				const share = total > 0 ? (f.balance / total) * 100 : 0;
				const target = f.targetBalance ?? 0;
				const progress =
					target > 0 ? Math.min(100, (f.balance / target) * 100) : null;
				const rule = allocationLabel(f);
				const reached = progress !== null && progress >= 100;

				return (
					<div
						key={f.id}
						className="border-border-subtle bg-surface-2/50 rounded-xl border p-3"
					>
						<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
							<div className="min-w-0">
								<p className="text-[13.5px] font-medium">{f.name}</p>
								{rule ? (
									<p className="text-muted-foreground text-[11.5px]">{rule}</p>
								) : null}
							</div>
							<div className="text-right">
								<p data-nominal className="tabular text-[15px] font-semibold">
									{formatRupiah(f.balance)}
								</p>
								<p className="text-muted-foreground text-[11.5px]">
									{share.toFixed(0)}% dari total cadangan
								</p>
							</div>
						</div>

						{progress !== null ? (
							<div className="mt-2">
								<div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
									<div
										className={cn(
											"h-full rounded-full transition-[width]",
											reached ? "bg-emerald-500" : "bg-primary",
										)}
										style={{ width: `${progress}%` }}
									/>
								</div>
								<p className="text-muted-foreground mt-1 text-[11.5px]">
									{reached ? (
										<span className="font-medium text-emerald-700 dark:text-emerald-400">
											Target tercapai
										</span>
									) : (
										<>
											{progress.toFixed(0)}% dari target{" "}
											<span data-nominal className="tabular">
												{formatRupiah(target)}
											</span>{" "}
											· kurang{" "}
											<span data-nominal className="tabular">
												{formatRupiah(target - f.balance)}
											</span>
										</>
									)}
								</p>
							</div>
						) : null}
					</div>
				);
			})}

			<div className="border-border-subtle flex flex-wrap items-baseline justify-between gap-2 border-t pt-3">
				<span className="text-muted-foreground text-[12.5px]">
					Total dana cadangan
				</span>
				<div className="flex items-baseline gap-3">
					<span data-nominal className="tabular text-[15px] font-semibold">
						{formatRupiah(total)}
					</span>
					<Link
						href="/finance/sinking-funds"
						className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
					>
						Kelola →
					</Link>
				</div>
			</div>
		</div>
	);
}
