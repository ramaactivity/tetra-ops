import Link from "next/link";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Rincian dana cadangan — ke mana uang yang disisihkan pergi.
 *
 * Bentuknya sengaja part-to-whole: satu batang bertumpuk untuk pembagiannya,
 * lalu kartu per dana. Versi sebelumnya memberi tiap dana satu bar progres ke
 * target selebar kartu; karena targetnya jutaan dan isinya baru 1–3%, keempat
 * bar itu terbaca seperti garis rusak dan tidak menyampaikan apa pun. Progres
 * ke target sekarang jadi satu baris teks, dan yang divisualkan adalah
 * proporsinya — pertanyaan yang memang ditanyakan.
 *
 * Warna: satu rona bertingkat (ramp emerald design system), bukan empat warna
 * berbeda. Lime/oranye/biru/merah sudah dikunci untuk makna status
 * (sukses/pending/info/bahaya) — memakainya sebagai warna seri akan menabrak
 * arti yang sudah dipegang seluruh aplikasi. Urutan gelap→terang mengikuti
 * besaran, dan dibalik di mode gelap supaya arah "makin besar makin menonjol"
 * tetap benar. Identitas tiap segmen dibawa label di kartunya, tidak pernah
 * oleh warna saja.
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

/**
 * Ramp emerald 900→200, dicerminkan persis di mode gelap (200→900) supaya arah
 * "porsi terbesar paling menonjol" tetap benar di dua latar.
 *
 * Langkah 900/700/500/200 dipilih dari hasil validator, bukan dikira-kira:
 * langkah yang lebih rapat (mis. menyelipkan 400) jatuh ke ΔE 8 antar segmen
 * bersebelahan — dua warna yang bahkan mata normal sulit bedakan.
 */
const RAMP = [
	"bg-emerald-900 dark:bg-emerald-200",
	"bg-emerald-700 dark:bg-emerald-500",
	"bg-emerald-500 dark:bg-emerald-700",
	"bg-emerald-200 dark:bg-emerald-900",
] as const;

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

	// Terbesar dulu — batang dan daftar kartunya harus urut sama, itu yang
	// membuat warna segmen bisa dicocokkan ke kartunya tanpa legenda terpisah.
	const rows = [...funds].sort((a, b) => b.balance - a.balance);
	const shareOf = (v: number) => (total > 0 ? (v / total) * 100 : 0);

	return (
		<div className="space-y-4">
			{total > 0 ? (
				<div
					// Celah pakai gap + segmen pakai flex-grow proporsional, BUKAN
					// width persen: 100% ditambah celah akan meluber dari wadahnya dan
					// segmen terakhir terpotong diam-diam.
					className="border-border-subtle bg-secondary flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full border p-px"
					role="img"
					aria-label={`Pembagian dana cadangan: ${rows
						.map((f) => `${f.name} ${shareOf(f.balance).toFixed(0)}%`)
						.join(", ")}`}
				>
					{rows.map((f, i) => {
						const share = shareOf(f.balance);
						if (share <= 0) return null;
						return (
							<div
								key={f.id}
								className={cn("min-w-0 rounded-[2px]", RAMP[i % RAMP.length])}
								style={{ flexGrow: share, flexBasis: 0 }}
							/>
						);
					})}
				</div>
			) : null}

			<div className="grid gap-3 sm:grid-cols-2">
				{rows.map((f, i) => {
					const share = shareOf(f.balance);
					const target = f.targetBalance ?? 0;
					const progress =
						target > 0 ? Math.min(100, (f.balance / target) * 100) : null;
					const rule = allocationLabel(f);

					return (
						<div
							key={f.id}
							className="border-border-subtle bg-surface-2/40 rounded-xl border p-3"
						>
							<div className="flex items-start justify-between gap-2">
								<div className="flex min-w-0 items-center gap-2">
									<span
										aria-hidden
										className={cn(
											"size-2.5 shrink-0 rounded-[3px]",
											RAMP[i % RAMP.length],
										)}
									/>
									<span className="truncate text-[13.5px] font-medium">
										{f.name}
									</span>
								</div>
								<span className="text-muted-foreground tabular shrink-0 text-[12px]">
									{share.toFixed(0)}%
								</span>
							</div>

							<p
								data-nominal
								className="tabular mt-1.5 text-[17px] font-semibold"
							>
								{formatRupiah(f.balance)}
							</p>

							<div className="text-muted-foreground mt-1 space-y-0.5 text-[11.5px]">
								{rule ? <p className="truncate">{rule}</p> : null}
								{progress !== null ? (
									<p className="truncate">
										{progress >= 100 ? (
											<span className="font-medium text-emerald-700 dark:text-emerald-400">
												Target tercapai
											</span>
										) : (
											<>
												Target{" "}
												<span data-nominal className="tabular">
													{formatRupiah(target)}
												</span>{" "}
												· baru {progress.toFixed(0)}%
											</>
										)}
									</p>
								) : null}
							</div>
						</div>
					);
				})}
			</div>

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
