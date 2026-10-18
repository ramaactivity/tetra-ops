import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CatatTalanganOwner } from "@/components/finance/catat-talangan-owner";
import {
	BatalTalanganButton,
	TalanganOwnerCard,
} from "@/components/finance/talangan-owner-card";
import { Container } from "@/components/layout/container";
import { getCurrentUser } from "@/lib/auth/get-user";
import { loadCashAccounts } from "@/lib/finance/cash-accounts";
import { filterEmoneyAccounts } from "@/lib/finance/emoney";
import { formatRupiah } from "@/lib/format";
import {
	loadTalanganOwner,
	loadTalanganRiwayat,
	type TalanganOwnerSaldo,
	type TalanganRiwayatRow,
} from "@/lib/rekap/uang-jalan-db";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const JENIS: Record<TalanganRiwayatRow["jenis"], string> = {
	uang_jalan: "Uang jalan",
	sisa_uang_jalan: "Sisa uang jalan",
	talangan: "Ditalangi",
	piutang: "Owner pinjam",
	bayar: "Dibayar",
	terima: "Diterima",
};

const tglPendek = (d: string) =>
	new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
	});

/** Kartu putih standar halaman ini — satu tingkat, tanpa kartu di dalam kartu. */
function Panel({
	title,
	meta,
	children,
	className,
}: {
	title?: string;
	meta?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"rounded-2xl border border-border-subtle bg-card shadow-[var(--shadow-level-2)]",
				className,
			)}
		>
			{title && (
				<div className="flex items-baseline justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
					<h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
					{meta && (
						<span className="text-[12px] text-muted-foreground">{meta}</span>
					)}
				</div>
			)}
			{children}
		</section>
	);
}

/**
 * Hutang-piutang Tetra ↔ owner. Semua: posisi + daftar owner + riwayat.
 * Per owner (?owner=): saldo & bayar/cicil, yang belum lunas, riwayat dengan
 * saldo berjalan. Kartu ringkas di Dashboard/Keuangan/rekap menautkan ke sini.
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
	const saldoOf = (id: string) => saldo.find((s) => s.id === id);
	const selected = owners.some((o) => o.id === ownerParam)
		? (ownerParam as string)
		: null;
	const cashAccounts = filterEmoneyAccounts(cash, false);

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

	const rows = selected
		? riwayat.filter((r) => r.ownerId === selected)
		: riwayat;
	const pilihan = selected ? saldoOf(selected) : undefined;

	return (
		<Container size="xl" className="space-y-3">
			<CatatTalanganOwner
				owners={owners}
				cashAccounts={cashAccounts}
				inTopbar
			/>

			{/* Tab owner */}
			<nav
				aria-label="Pilih owner"
				className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5"
			>
				{[{ id: null as string | null, name: "Semua" }, ...owners].map((o) => {
					const active = selected === o.id;
					return (
						<Link
							key={o.id ?? "semua"}
							href={
								o.id
									? `/finance/hutang-owner?owner=${o.id}`
									: "/finance/hutang-owner"
							}
							aria-current={active ? "page" : undefined}
							className={cn(
								"inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium transition-colors",
								active
									? "border-transparent bg-foreground text-background"
									: "border-border-default bg-card text-foreground/80 hover:bg-secondary",
							)}
						>
							{o.name}
						</Link>
					);
				})}
			</nav>

			{selected ? (
				<OwnerDetail
					name={nameOf(selected)}
					saldo={pilihan}
					cashAccounts={cashAccounts}
				/>
			) : (
				<div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
					{/* Posisi: satu angka utama, sisanya keterangan. */}
					<Panel className="px-5 py-4">
						<p className="text-[13px] text-muted-foreground">
							Tetra berutang ke owner
						</p>
						<p
							data-nominal
							className="tabular mt-0.5 text-[30px] font-bold leading-tight tracking-[-0.02em] text-foreground"
						>
							{formatRupiah(tetraBerutang)}
						</p>
						<dl className="mt-3 space-y-1 text-[13px]">
							<Stat label="Belum lunas" value={`${itemTerbuka} item`} />
							<Stat
								label="Dibayar bulan ini"
								value={formatRupiah(dibayarBulanIni)}
								nominal
							/>
							<Stat
								label="Owner berutang ke Tetra"
								value={formatRupiah(ownerBerutang)}
								nominal
							/>
						</dl>
					</Panel>

					<Panel title="Per owner" meta="pilih untuk bayar / cicil">
						<ul className="divide-y divide-border-subtle">
							{owners.map((o) => {
								const s = saldoOf(o.id);
								const v = s?.saldo ?? 0;
								return (
									<li key={o.id}>
										<Link
											href={`/finance/hutang-owner?owner=${o.id}`}
											className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-secondary/60"
										>
											<span className="min-w-0 flex-1">
												<span className="block text-[14px] font-semibold text-foreground">
													{o.name}
												</span>
												<span className="block text-[12px] text-muted-foreground">
													{v > 0
														? `${s?.rincian.length ?? 0} item belum lunas`
														: v < 0
															? "berutang ke Tetra"
															: "Lunas"}
												</span>
											</span>
											<span
												data-nominal
												className={cn(
													"tabular text-[15px] font-semibold",
													v > 0
														? "text-amber-700"
														: v < 0
															? "text-sky-700"
															: "text-muted-foreground",
												)}
											>
												{formatRupiah(Math.abs(v))}
											</span>
											<ChevronRight
												className="size-4 text-muted-foreground"
												aria-hidden
											/>
										</Link>
									</li>
								);
							})}
						</ul>
					</Panel>
				</div>
			)}

			<Riwayat rows={rows} showOwner={!selected} nameOf={nameOf} />
		</Container>
	);
}

function Stat({
	label,
	value,
	nominal = false,
}: {
	label: string;
	value: string;
	nominal?: boolean;
}) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd
				data-nominal={nominal || undefined}
				className="tabular font-semibold text-foreground"
			>
				{value}
			</dd>
		</div>
	);
}

/** Per owner: saldo + bayar/cicil, lalu yang belum lunas. */
function OwnerDetail({
	name,
	saldo,
	cashAccounts,
}: {
	name: string;
	saldo: TalanganOwnerSaldo | undefined;
	cashAccounts: Array<{ code: string; name: string; balance: number }>;
}) {
	if (!saldo)
		return (
			<Panel className="px-5 py-4">
				<p className="text-[14px] font-semibold">{name}</p>
				<p className="text-[13px] text-muted-foreground">
					Tidak ada hutang-piutang dengan {name}. Catat lewat tombol di atas
					kalau ada.
				</p>
			</Panel>
		);
	return (
		<div className="grid items-start gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
			<TalanganOwnerCard owners={[saldo]} cashAccounts={cashAccounts} compact />
			<Panel
				title={saldo.saldo >= 0 ? "Belum lunas" : "Piutang belum kembali"}
				meta={`${saldo.rincian.length} item · paling lama dulu`}
			>
				{saldo.rincian.length === 0 ? (
					<p className="px-5 py-4 text-[13px] text-muted-foreground">
						Semua sudah lunas.
					</p>
				) : (
					<ul className="divide-y divide-border-subtle">
						{saldo.rincian.map((it) => (
							<li
								key={`${it.label}|${it.date}|${it.amount}`}
								className="grid grid-cols-[minmax(0,1fr)_auto_2rem] items-center gap-3 px-5 py-2.5 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto_2rem]"
							>
								<span className="hidden text-[12px] text-muted-foreground sm:block">
									{tglPendek(it.date)}
								</span>
								<span className="min-w-0 text-[13px]">
									<span className="block text-[11.5px] text-muted-foreground sm:hidden">
										{tglPendek(it.date)}
									</span>
									{it.projectId ? (
										<Link
											href={`/operations/${it.projectId}/rekap`}
											className="hover:underline"
										>
											{it.label}
										</Link>
									) : (
										it.label
									)}
								</span>
								<span className="text-right">
									<span
										data-nominal
										className="tabular block text-[13px] font-semibold"
									>
										{formatRupiah(it.sisa)}
									</span>
									{it.sisa < it.amount && (
										<span className="block text-[11px] text-muted-foreground">
											sisa dari{" "}
											<span data-nominal className="tabular">
												{formatRupiah(it.amount)}
											</span>
										</span>
									)}
								</span>
								<span className="flex justify-end">
									{it.batalId && <BatalTalanganButton id={it.batalId} />}
								</span>
							</li>
						))}
					</ul>
				)}
			</Panel>
		</div>
	);
}

/** Riwayat (buku besar) — kolom lurus, saldo berjalan, terbaru dulu. */
function Riwayat({
	rows,
	showOwner,
	nameOf,
}: {
	rows: TalanganRiwayatRow[];
	showOwner: boolean;
	nameOf: (id: string) => string;
}) {
	const cols = showOwner
		? "sm:grid-cols-[4.5rem_5rem_minmax(0,1fr)_7.5rem_7.5rem_4rem]"
		: "sm:grid-cols-[4.5rem_minmax(0,1fr)_7.5rem_7.5rem_4rem]";
	return (
		<Panel title="Riwayat" meta={`${rows.length} transaksi · terbaru dulu`}>
			{rows.length === 0 ? (
				<p className="px-5 py-4 text-[13px] text-muted-foreground">
					Belum ada transaksi.
				</p>
			) : (
				<>
					<div
						className={cn(
							"hidden gap-3 border-b border-border-subtle px-5 py-2 text-[11.5px] font-medium text-muted-foreground sm:grid",
							cols,
						)}
					>
						<span>Tanggal</span>
						{showOwner && <span>Owner</span>}
						<span>Keterangan</span>
						<span className="text-right">Nominal</span>
						<span className="text-right">Saldo</span>
						<span />
					</div>
					<ul className="divide-y divide-border-subtle">
						{rows.map((r) => (
							<li
								key={r.id}
								className={cn(
									"grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-5 py-2.5 sm:items-center",
									cols,
									r.reversed && "opacity-50",
								)}
							>
								<span className="order-1 text-[12px] text-muted-foreground sm:order-none">
									{tglPendek(r.date)}
									{showOwner && (
										<span className="font-medium text-foreground sm:hidden">
											{" "}
											· {nameOf(r.ownerId)}
										</span>
									)}
								</span>
								{showOwner && (
									<span className="hidden text-[13px] font-medium sm:block">
										{nameOf(r.ownerId)}
									</span>
								)}
								<span className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1">
									<span className="text-[11.5px] font-medium text-muted-foreground">
										{JENIS[r.jenis]}
										{r.reversed ? " · dibatalkan" : ""}
									</span>
									<span
										className={cn(
											"block text-[13px]",
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
									</span>
								</span>
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
								<span
									data-nominal
									className="order-5 tabular text-right text-[12.5px] text-muted-foreground sm:order-none"
								>
									{formatRupiah(Math.abs(r.saldo))}
									{r.saldo < 0 ? " ↩" : ""}
								</span>
								<span className="order-2 -my-1 flex items-center justify-end gap-0.5 sm:order-none sm:my-0">
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
					<p className="border-t border-border-subtle px-5 py-2.5 text-[11.5px] text-muted-foreground">
						+ hutang Tetra ke owner bertambah · − dibayar / berkurang · ↩ owner
						berutang ke Tetra. Catatan dari acara dibatalkan di rekap acaranya.
					</p>
				</>
			)}
		</Panel>
	);
}
