/**
 * /lab — TEMPORARY design lab (public, no auth). Now composes the REAL shell
 * (OwnerSidebar + OwnerTopBar) to verify the port, with inline KPI/bento
 * content as the next things to port. Delete before ship.
 */
import { Plus } from "lucide-react";
import { OwnerSidebar } from "@/components/layouts/owner-sidebar";
import { OwnerTopBar } from "@/components/layouts/owner-topbar";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { buttonVariants } from "@/components/ui/button";

const R_CARD = "rounded-[16px]";
const R_CTRL = "rounded-[12px]";

const PILL = {
	lime: "bg-emerald-300 text-emerald-950",
	orange: "bg-amber-300 text-amber-950",
	blue: "bg-sky-300 text-sky-950",
	red: "bg-rose-300 text-rose-950",
} as const;

function Progress({ pct, fill }: { pct: number; fill: string }) {
	const done = Math.max(0, Math.min(100, pct));
	return (
		<div className="flex h-[22px] w-full items-stretch gap-1.5">
			{done > 0 ? (
				<div
					className="rounded-[7px]"
					style={{ width: `${done}%`, backgroundColor: fill }}
				/>
			) : null}
			{done < 100 ? (
				<div className="flex-1 rounded-[7px] bg-[repeating-linear-gradient(45deg,#dedcd4_0,#dedcd4_5px,#f1f0eb_5px,#f1f0eb_11px)]" />
			) : null}
		</div>
	);
}

export default async function LabPage() {
	return (
		<div className="flex min-h-dvh gap-3 p-3">
			<OwnerSidebar />
			<div className="flex min-w-0 flex-1 flex-col gap-3">
				<OwnerTopBar name="Ramadan Saputra" email="rama@tetra.id" role="owner" />
				<main className="flex min-w-0 flex-1 flex-col gap-3">
					<SectionHeader
						as="h1"
						title="Lab"
						actions={
							<a className={buttonVariants({ variant: "default" })} href="#lab">
								<Plus className="size-4" />
								Tambah Paket
							</a>
						}
					/>
					{/* KPI grid */}
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<KpiCard label="Revenue MTD" value="Rp 13,5jt" hint="Uang diterima · turun 44% vs Mei" badge="Cash" badgeTone="blue" />
						<KpiCard label="Net Profit MTD" value="Rp 0" hint="Belum ada event ter-settle bulan ini" badge="0%" badgeTone="orange" />
						<KpiCard label="Outstanding" value="Rp 15,2jt" hint="Piutang event live" badge="8 event" badgeTone="red" />
						<KpiCard label="Sinking Total" value="Rp 689rb" hint="4 dana cadangan aktif" badge="On track" badgeTone="lime" />
					</div>

					<div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
						<section className={`flex min-h-0 flex-col ${R_CARD} bg-card p-5 shadow-[var(--shadow-level-2)] lg:col-span-2`}>
							<div className="flex shrink-0 items-center justify-between">
								<h2 className="text-[21px] font-bold tracking-tight text-foreground">
									Event terdekat
								</h2>
								<button className="rounded-full bg-secondary px-3.5 py-1.5 text-[13px] font-medium text-foreground">
									Semua
								</button>
							</div>
							<div className="mt-4 flex-1 space-y-2.5">
								{[
									["Luthfi & Rosya", "Sab, 6 Jun · 11:30", "Menunggu Settle", "orange"],
									["Graduation Grade 6", "Sab, 6 Jun · 17:00", "Lunas", "lime"],
									["Bramastha & Adindya", "Min, 7 Jun · 10:00", "DP", "blue"],
								].map(([name, when, status, tone]) => (
									<div
										key={name}
										className={`flex items-center justify-between ${R_CTRL} bg-surface-3/60 px-4 py-3`}
									>
										<div>
											<p className="text-[14.5px] font-medium text-foreground">{name}</p>
											<p className="mt-0.5 text-[12.5px] font-normal text-muted-foreground">{when}</p>
										</div>
										<span className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-[11.5px] font-medium ${PILL[tone as keyof typeof PILL]}`}>
											{status}
										</span>
									</div>
								))}
							</div>
							<button className={`mt-4 shrink-0 ${R_CTRL} bg-primary py-3 text-[14px] font-semibold text-primary-foreground`}>
								Lihat semua event
							</button>
						</section>

						<section className={`flex min-h-0 flex-col ${R_CARD} bg-card p-5 shadow-[var(--shadow-level-2)]`}>
							<h2 className="text-[21px] font-bold tracking-tight text-foreground">
								Target capaian
							</h2>
							<div className="mt-5 flex flex-1 flex-col justify-center gap-6">
								<div>
									<div className="flex items-end justify-between">
										<span className="text-[13.5px] font-medium text-foreground">Bulanan</span>
										<span className="text-[13.5px] font-bold text-emerald-700">100%</span>
									</div>
									<div className="mt-2.5"><Progress pct={100} fill="#74c02f" /></div>
									<p className="mt-1.5 text-[12.5px] font-normal text-muted-foreground">10 / 10 event 🎉</p>
								</div>
								<div>
									<div className="flex items-end justify-between">
										<span className="text-[13.5px] font-medium text-foreground">Tahunan</span>
										<span className="text-[13.5px] font-bold text-amber-700">57%</span>
									</div>
									<div className="mt-2.5"><Progress pct={57} fill="#fb6d39" /></div>
									<p className="mt-1.5 text-[12.5px] font-normal text-muted-foreground">Kurang 43 event lagi.</p>
								</div>
							</div>
						</section>
					</div>
				</main>
			</div>
		</div>
	);
}
