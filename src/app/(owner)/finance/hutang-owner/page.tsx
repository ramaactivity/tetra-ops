import { ExternalLink, HandCoins, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CatatTalanganOwner } from "@/components/finance/catat-talangan-owner";
import {
	BatalTalanganButton,
	TalanganOwnerCard,
} from "@/components/finance/talangan-owner-card";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { RekapCard } from "@/components/rekap/rekap-ui";
import { getCurrentUser } from "@/lib/auth/get-user";
import { loadCashAccounts } from "@/lib/finance/cash-accounts";
import { filterEmoneyAccounts } from "@/lib/finance/emoney";
import { formatRupiah } from "@/lib/format";
import {
	loadTalanganOwner,
	loadTalanganRiwayat,
	type TalanganRiwayatRow,
} from "@/lib/rekap/uang-jalan-db";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const JENIS: Record<
	TalanganRiwayatRow["jenis"],
	{ label: string; tone: string }
> = {
	uang_jalan: { label: "Uang jalan", tone: "bg-amber-500/12 text-amber-800" },
	sisa_uang_jalan: {
		label: "Sisa uang jalan",
		tone: "bg-sky-500/12 text-sky-800",
	},
	talangan: { label: "Ditalangi", tone: "bg-amber-500/12 text-amber-800" },
	piutang: { label: "Owner pinjam", tone: "bg-sky-500/12 text-sky-800" },
	bayar: { label: "Dibayar", tone: "bg-emerald-500/12 text-emerald-800" },
	terima: { label: "Diterima", tone: "bg-emerald-500/12 text-emerald-800" },
};

const tgl = (d: string) =>
	new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

/**
 * Hutang-piutang Tetra ↔ owner — satu tempat untuk saldo, rincian yang belum
 * lunas, pelunasan/cicilan, dan riwayat lengkap (dengan saldo berjalan).
 * Kartu ringkas di Dashboard/Keuangan/rekap menautkan ke sini.
 */
export default async function HutangOwnerPage({
	searchParams,
}: {
	searchParams: Promise<{ owner?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner")
		redirect("/finance");
	const { owner: ownerParam } = await searchParams;

	const supabase = await createClient();
	const [saldo, riwayat, cash, { data: ownerRows }] = await Promise.all([
		loadTalanganOwner(supabase),
		loadTalanganRiwayat(supabase),
		loadCashAccounts(supabase),
		supabase
			.from("users")
			.select("id, full_name, nickname")
			.eq("role", "owner")
			.eq("is_active", true)
			.order("full_name"),
	]);
	const owners = (ownerRows ?? []).map((o) => ({
		id: o.id as string,
		name: (o.nickname as string | null) || (o.full_name as string),
	}));
	const nameOf = (id: string) =>
		owners.find((o) => o.id === id)?.name ?? "Owner";
	const selected = owners.some((o) => o.id === ownerParam)
		? (ownerParam as string)
		: null;
	const cashAccounts = filterEmoneyAccounts(cash, false);

	// Ringkasan (semua owner).
	const tetraBerutang = saldo
		.filter((s) => s.saldo > 0)
		.reduce((t, s) => t + s.saldo, 0);
	const ownerBerutang = saldo
		.filter((s) => s.saldo < 0)
		.reduce((t, s) => t - s.saldo, 0);
	const bulanIni = new Date(Date.now() + 7 * 3600_000)
		.toISOString()
		.slice(0, 7);
	const dibayarBulanIni = riwayat
		.filter(
			(r) => !r.reversed && r.jenis === "bayar" && r.date.startsWith(bulanIni),
		)
		.reduce((t, r) => t - r.amount, 0);
	const itemTerbuka = saldo.reduce((t, s) => t + s.rincian.length, 0);

	const kartu = selected ? saldo.filter((s) => s.id === selected) : saldo;
	const rows = selected
		? riwayat.filter((r) => r.ownerId === selected)
		: riwayat;
	const saldoOf = (id: string) => saldo.find((s) => s.id === id)?.saldo ?? 0;

	return (
		<Container size="xl" className="space-y-3">
			<CatatTalanganOwner
				owners={owners}
				cashAccounts={cashAccounts}
				inTopbar
			/>
			<SectionHeader
				title="Hutang Owner"
				description="Uang pribadi owner yang dipakai Tetra (uang jalan, biaya acara, pinjaman) dan sebaliknya. Lunasi sekaligus atau dicicil."
			/>

			<KpiRow className="lg:grid-cols-4">
				<KpiCard
					label="Tetra berutang ke owner"
					value={formatRupiah(tetraBerutang)}
					hint={`${saldo.filter((s) => s.saldo > 0).length} owner`}
					icon={HandCoins}
					accent={tetraBerutang > 0 ? "amber" : "default"}
				/>
				<KpiCard
					label="Owner berutang ke Tetra"
					value={formatRupiah(ownerBerutang)}
					hint={`${saldo.filter((s) => s.saldo < 0).length} owner`}
					icon={Wallet}
				/>
				<KpiCard
					label="Dibayar ke owner bulan ini"
					value={formatRupiah(dibayarBulanIni)}
					hint="pelunasan & cicilan"
				/>
				<KpiCard
					label="Item belum lunas"
					value={String(itemTerbuka)}
					hint="uang jalan, biaya acara, pinjaman"
				/>
			</KpiRow>

			{/* Filter owner */}
			<div className="flex flex-wrap gap-1.5">
				{[{ id: null as string | null, name: "Semua" }, ...owners].map((o) => {
					const s = o.id ? saldoOf(o.id) : null;
					const active = selected === o.id;
					return (
						<Link
							key={o.id ?? "semua"}
							href={
								o.id
									? `/finance/hutang-owner?owner=${o.id}`
									: "/finance/hutang-owner"
							}
							className={cn(
								"inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition-colors",
								active
									? "border-transparent bg-foreground text-background"
									: "border-border-default bg-card hover:bg-secondary",
							)}
						>
							{o.name}
							{s ? (
								<span
									data-nominal
									className={cn(
										"tabular text-[11.5px]",
										active
											? "opacity-80"
											: s > 0
												? "text-amber-700"
												: "text-sky-700",
									)}
								>
									{formatRupiah(Math.abs(s))}
								</span>
							) : null}
						</Link>
					);
				})}
			</div>

			{/* Saldo + bayar/cicil per owner */}
			{kartu.length > 0 ? (
				<TalanganOwnerCard owners={kartu} cashAccounts={cashAccounts} />
			) : (
				<p className="rounded-2xl border border-border-subtle bg-card px-4 py-3 text-[13px] text-muted-foreground">
					{selected
						? `Tidak ada hutang-piutang dengan ${nameOf(selected)}.`
						: "Tidak ada hutang-piutang dengan owner."}
				</p>
			)}

			{/* Riwayat lengkap */}
			<RekapCard className="space-y-2">
				<div className="flex items-baseline justify-between gap-3">
					<h3 className="type-heading">Riwayat</h3>
					<span className="text-[12px] text-muted-foreground">
						{rows.length} transaksi · terbaru dulu
					</span>
				</div>
				{rows.length === 0 ? (
					<p className="text-[13px] text-muted-foreground">
						Belum ada transaksi.
					</p>
				) : (
					<ul className="divide-y divide-border-subtle">
						{rows.map((r) => (
							<li
								key={r.id}
								className={cn(
									"grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[6.5rem_1fr_8rem_10rem_4rem]",
									r.reversed && "opacity-50",
								)}
							>
								<span className="order-1 text-[12px] text-muted-foreground sm:order-none sm:pt-0.5">
									{tgl(r.date)}
								</span>
								<div className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1">
									<div className="flex flex-wrap items-center gap-1.5">
										<span
											className={cn(
												"rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
												JENIS[r.jenis].tone,
											)}
										>
											{JENIS[r.jenis].label}
										</span>
										{!selected && (
											<span className="text-[12.5px] font-semibold">
												{nameOf(r.ownerId)}
											</span>
										)}
										{r.reversed && (
											<span className="text-[11px] font-medium text-rose-700">
												dibatalkan
											</span>
										)}
									</div>
									<p
										className={cn(
											"mt-0.5 text-[13px]",
											r.reversed && "line-through",
										)}
									>
										{r.projectId ? (
											<Link
												href={`/operations/${r.projectId}/rekap`}
												className="hover:underline"
											>
												{r.label}
											</Link>
										) : (
											r.label
										)}
									</p>
								</div>
								<span
									data-nominal
									className={cn(
										"order-4 tabular text-[13px] font-semibold sm:order-none sm:text-right",
										r.amount > 0 ? "text-amber-700" : "text-emerald-700",
									)}
								>
									{r.amount > 0 ? "+" : "−"}
									{formatRupiah(Math.abs(r.amount))}
								</span>
								<span className="order-5 text-right text-[12px] text-muted-foreground sm:order-none">
									saldo{" "}
									<span data-nominal className="tabular text-foreground">
										{formatRupiah(Math.abs(r.saldo))}
									</span>
									{r.saldo < 0 ? " (owner berutang)" : ""}
								</span>
								<span className="order-2 -my-1 flex items-center justify-end gap-1 sm:order-none sm:my-0">
									{r.proofUrl && (
										<a
											href={r.proofUrl}
											target="_blank"
											rel="noopener noreferrer"
											aria-label="Buka bukti"
											className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
										>
											<ExternalLink className="size-3.5" />
										</a>
									)}
									{r.batalId && <BatalTalanganButton id={r.batalId} />}
								</span>
							</li>
						))}
					</ul>
				)}
				<p className="text-[11.5px] text-muted-foreground">
					+ = Tetra makin berutang ke owner · − = dibayar / dikurangi. Catatan
					dari acara (uang jalan, biaya rekap) dibatalkan di rekap acaranya.
				</p>
			</RekapCard>
		</Container>
	);
}
