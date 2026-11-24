import {
	CircleAlert,
	CircleCheck,
	CircleDot,
	ClipboardCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatRupiah } from "@/lib/format";
import type { Cek } from "@/lib/rekap/kesiapan";
import { RekapCard, SectionHeader } from "./rekap-ui";

const ICON = {
	ok: { Icon: CircleCheck, cls: "text-emerald-600 dark:text-emerald-400" },
	cek: { Icon: CircleDot, cls: "text-amber-600 dark:text-amber-400" },
	perlu: { Icon: CircleAlert, cls: "text-rose-600 dark:text-rose-400" },
} as const;

/**
 * Kesiapan settle (owner 24 Nov 2026): yang masih bikin angka settle salah
 * tampil di atas, lengkap dengan biaya lapangan — supaya owner menyetujui
 * rekap dengan melihat uangnya, bukan hanya bahan.
 */
export function KesiapanSettleCard({
	cek,
	biaya,
	extendAksi,
}: {
	cek: Cek[];
	biaya: Array<{
		label: string;
		amount: number;
		payer: string;
		notaUrl: string | null;
	}>;
	/** Tombol tagihkan extend — tampil di baris "extend" yang belum ditagih. */
	extendAksi?: ReactNode;
}) {
	const perlu = cek.filter((c) => c.level === "perlu").length;
	const dicek = cek.filter((c) => c.level === "cek").length;
	// Yang bermasalah dulu; yang beres di bawah.
	const order = { perlu: 0, cek: 1, ok: 2 } as const;
	const sorted = [...cek].sort((a, b) => order[a.level] - order[b.level]);
	const totalBiaya = biaya.reduce((t, b) => t + b.amount, 0);
	return (
		<RekapCard className="space-y-3">
			<SectionHeader
				icon={ClipboardCheck}
				title="Kesiapan settle"
				description={
					perlu > 0
						? `${perlu} hal perlu dibereskan${dicek ? `, ${dicek} perlu dicek` : ""} sebelum settle.`
						: dicek > 0
							? `${dicek} hal perlu dicek — settle sudah boleh.`
							: "Semua beres — siap di-settle."
				}
			/>
			<ul className="divide-y divide-border-subtle">
				{sorted.map((c) => {
					const { Icon, cls } = ICON[c.level];
					return (
						<li
							key={c.key}
							className="flex flex-wrap items-start gap-x-2.5 gap-y-1.5 py-2"
						>
							<Icon className={`mt-0.5 size-4 shrink-0 ${cls}`} aria-hidden />
							<div className="min-w-0 flex-1 basis-56">
								<p className="text-[13px] font-medium text-foreground">
									{c.judul}
								</p>
								{c.detail ? (
									<p className="text-[12px] text-muted-foreground">
										{c.detail}
									</p>
								) : null}
							</div>
							{c.key === "extend" && c.level === "perlu" && extendAksi ? (
								extendAksi
							) : c.href && c.aksi ? (
								<Link
									href={c.href}
									className="ml-6.5 shrink-0 rounded-full border border-border-default px-3 py-1 text-[12px] font-medium hover:bg-secondary sm:ml-0"
								>
									{c.aksi}
								</Link>
							) : null}
						</li>
					);
				})}
			</ul>
			{biaya.length > 0 ? (
				<div className="rounded-xl bg-secondary/60 p-3">
					<div className="flex items-baseline justify-between gap-2">
						<p className="text-[12.5px] font-semibold text-foreground">
							Biaya lapangan dari rekap
						</p>
						<p
							className="tabular text-[12.5px] font-semibold text-foreground"
							data-nominal
						>
							{formatRupiah(totalBiaya)}
						</p>
					</div>
					<ul className="mt-1.5 space-y-1">
						{biaya.map((b) => (
							<li
								key={`${b.label}-${b.amount}`}
								className="flex items-baseline justify-between gap-3 text-[12.5px]"
							>
								<span className="min-w-0 truncate text-foreground">
									{b.label}
									<span className="text-muted-foreground"> · {b.payer}</span>
									{b.notaUrl ? (
										<a
											href={b.notaUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="ml-1.5 text-muted-foreground underline underline-offset-2 hover:text-foreground"
										>
											Nota
										</a>
									) : (
										<span className="ml-1.5 text-amber-700 dark:text-amber-300">
											tanpa nota
										</span>
									)}
								</span>
								<span className="tabular shrink-0" data-nominal>
									{formatRupiah(b.amount)}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</RekapCard>
	);
}
