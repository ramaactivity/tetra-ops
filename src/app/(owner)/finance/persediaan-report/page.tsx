import {
	AlertTriangle,
	BarChart3,
	Boxes,
	CalendarRange,
	ChevronLeft,
	ChevronRight,
	ClipboardList,
	Coins,
	Layers,
	PackageSearch,
	Wallet2,
} from "lucide-react";
import Link from "next/link";
import { ExportCsvButton } from "@/components/finance/persediaan/export-csv-button";
import { RollforwardTable } from "@/components/finance/persediaan/rollforward-table";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { KpiCard } from "@/components/operations/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TabNav } from "@/components/ui/tab-nav";
import {
	computeRollforward,
	type RollforwardRpcRow,
} from "@/lib/finance/inventory-rollforward";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const ID_MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"Mei",
	"Jun",
	"Jul",
	"Agu",
	"Sep",
	"Okt",
	"Nov",
	"Des",
];
const ID_MONTH_NAMES_FULL = [
	"Januari",
	"Februari",
	"Maret",
	"April",
	"Mei",
	"Juni",
	"Juli",
	"Agustus",
	"September",
	"Oktober",
	"November",
	"Desember",
];

function parseMonthParam(s: string | undefined): { ym: string; label: string } {
	const today = new Date();
	let y = today.getFullYear();
	let m = today.getMonth() + 1;
	if (s && /^\d{4}-\d{2}$/.test(s)) {
		const [py, pm] = s.split("-").map(Number);
		y = py;
		m = pm;
	}
	const ym = `${y}-${String(m).padStart(2, "0")}`;
	return { ym, label: `${ID_MONTH_NAMES_FULL[m - 1]} ${y}` };
}

function shiftMonth(ym: string, delta: number): string {
	const [y, m] = ym.split("-").map(Number);
	const d = new Date(y, m - 1 + delta, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Compact Rupiah for KPI tiles so large values never overflow the card.
 *  Full format under 10 jt; "Rp X,X jt" / "Rp X,X M" above. */
function rpCompact(v: number): string {
	const a = Math.abs(v);
	const sign = v < 0 ? "−" : "";
	if (a >= 1_000_000_000)
		return `${sign}Rp ${(a / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
	if (a >= 10_000_000)
		return `${sign}Rp ${(a / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
	return formatRupiah(v);
}

type Tab = "cogs" | "opname";

export default async function PersediaanReportPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string; month?: string }>;
}) {
	const params = await searchParams;
	const tab: Tab = params.tab === "opname" ? "opname" : "cogs";
	const { ym, label } = parseMonthParam(params.month);
	const nextYm = shiftMonth(ym, +1);
	const pStart = `${ym}-01T00:00:00Z`;
	const pEnd = `${nextYm}-01T00:00:00Z`;

	const supabase = await createClient();
	const { data: rpcRows, error } = await supabase.rpc(
		"get_inventory_rollforward",
		{ p_start: pStart, p_end: pEnd },
	);
	const data = computeRollforward((rpcRows ?? []) as RollforwardRpcRow[]);

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				as="h1"
				eyebrow="Finance"
				title="Persediaan & COGS"
				description={`Roll-forward stok bahan baku (WAC) · ${label}`}
				actions={
					<div className="flex items-center gap-2">
						<MonthSwitcher ym={ym} tab={tab} />
						{tab === "cogs" && data.itemCount > 0 && (
							<ExportCsvButton data={data} month={ym} />
						)}
					</div>
				}
			/>

			<TabNav
				aria-label="Persediaan"
				items={[
					{
						label: "Biaya Bahan",
						href: `/finance/persediaan-report?tab=cogs&month=${ym}`,
						icon: <BarChart3 className="size-4 shrink-0" aria-hidden />,
						active: tab === "cogs",
					},
					{
						label: "Stock Opname",
						href: `/finance/persediaan-report?tab=opname&month=${ym}`,
						icon: <ClipboardList className="size-4 shrink-0" aria-hidden />,
						active: tab === "opname",
					},
				]}
			/>

			{tab === "cogs" &&
				(error ? (
					<Banner tone="rose">
						Gagal memuat data: {error.message}. Muat ulang halaman.
					</Banner>
				) : data.itemCount === 0 ? (
					<EmptyState
						icon={PackageSearch}
						title="Tidak ada pergerakan bulan ini"
						description={`Belum ada stok awal, pembelian, atau pemakaian untuk ${label}. Coba bulan lain, atau catat pembelian / jalankan opname.`}
					/>
				) : (
					<CogsView data={data} label={label} />
				))}

			{tab === "opname" && (
				<OpnameView
					supabase={supabase}
					pStart={pStart}
					pEnd={pEnd}
					label={label}
				/>
			)}
		</Container>
	);
}

function CogsView({
	data,
	label,
}: {
	data: ReturnType<typeof computeRollforward>;
	label: string;
}) {
	const { flags } = data;
	return (
		<div className="space-y-3">
			{/* Degradation banners — at most two: data-quality (rose) + opname (amber). */}
			{flags.negativeSkus.length > 0 && (
				<Banner tone="rose">
					<strong>{flags.negativeSkus.length} item stok minus</strong> (
					{flags.negativeSkus.join(", ")}) — konsumsi tercatat tanpa pembelian/
					opname pembanding, jadi nilai Stok Awal/Akhir-nya tampak ekstrem.
					Lakukan <OpnameLink /> untuk koreksi.
				</Banner>
			)}
			{(!flags.hasThisOpname || !flags.hasPriorOpname) && (
				<Banner tone="amber">
					Belum ada Stock Opname{" "}
					{!flags.hasThisOpname && !flags.hasPriorOpname
						? `sebelum & dalam ${label}`
						: !flags.hasThisOpname
							? `dalam ${label}`
							: `sebelum ${label}`}
					{!flags.hasPriorOpname && " — Stok Awal jadi estimasi"}
					{!flags.hasThisOpname && " — Stok Akhir pakai stok sistem"}, belum
					diaudit fisik. Jalankan <OpnameLink /> untuk angka akurat & menangkap
					selisih.
				</Banner>
			)}

			<KpiRow className="lg:grid-cols-5">
				<KpiCard
					label="Total Biaya Bahan"
					value={rpCompact(data.kpis.totalCogs)}
					hint="bahan terpakai di event (HPP)"
					icon={Coins}
					accent="primary"
				/>
				<KpiCard
					label="Mediaset"
					value={rpCompact(data.kpis.mediasetCogs)}
					hint="biaya media"
					icon={Layers}
					accent="sky"
				/>
				<KpiCard
					label="Sleeve"
					value={rpCompact(data.kpis.sleeveCogs)}
					hint="biaya sleeve"
					icon={Layers}
					accent="amber"
				/>
				<KpiCard
					label="Flashdisk"
					value={rpCompact(data.kpis.flashdiskCogs)}
					hint="biaya flashdisk + box"
					icon={Layers}
					accent="rose"
				/>
				<KpiCard
					label="Nilai Stok Tersisa"
					value={rpCompact(data.kpis.closingValue)}
					hint={`${data.itemCount} item · jumlah × harga rata-rata`}
					icon={Wallet2}
					accent="emerald"
				/>
			</KpiRow>

			<p className="text-[12px] text-muted-foreground">
				<strong className="font-medium text-foreground">Pemakaian</strong> =
				konsumsi event nyata (rekap, dinilai HPP saat pakai). Stok Awal/Akhir =
				nilai persediaan (WAC = purchase_price_avg).{" "}
				<strong className="font-medium text-foreground">Selisih</strong> =
				mutasi stok yang belum dijelaskan pemakaian (penyesuaian/shrinkage) —
				idealnya nol; opname mengoreksinya.
			</p>

			<p className="text-[11px] text-muted-foreground md:hidden">
				← Geser tabel untuk melihat semua kolom →
			</p>
			<RollforwardTable data={data} />
		</div>
	);
}

async function OpnameView({
	supabase,
	pStart,
	pEnd,
	label,
}: {
	supabase: Awaited<ReturnType<typeof createClient>>;
	pStart: string;
	pEnd: string;
	label: string;
}) {
	const [{ data: last }, { data: thisMonth }, { count: itemCount }] =
		await Promise.all([
			supabase
				.from("stock_takes")
				.select("committed_at")
				.eq("status", "committed")
				.order("committed_at", { ascending: false })
				.limit(1)
				.maybeSingle(),
			supabase
				.from("stock_takes")
				.select("status, committed_at, taken_at")
				.gte("taken_at", pStart)
				.lt("taken_at", pEnd)
				.order("taken_at", { ascending: false })
				.limit(1)
				.maybeSingle(),
			supabase
				.from("inventory_items")
				.select("id", { count: "exact", head: true })
				.eq("category", "inventory")
				.eq("is_active", true)
				.is("deleted_at", null),
		]);

	const thisStatus = (thisMonth as { status?: string } | null)?.status;
	const thisLabel =
		thisStatus === "committed"
			? "Sudah selesai (committed)"
			: thisStatus === "draft"
				? "Ada draft (belum di-commit)"
				: "Belum ada";
	const thisTone =
		thisStatus === "committed"
			? "emerald"
			: thisStatus === "draft"
				? "amber"
				: "rose";

	return (
		<div className="space-y-3">
			<Banner tone="amber">
				Stok Awal & Akhir paling akurat kalau berasal dari Stock Opname (hitung
				fisik). Tanpa opname, laporan COGS memakai stok sistem yang bisa
				melenceng dari kenyataan.
			</Banner>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<InfoTile label={`Opname ${label}`} value={thisLabel} tone={thisTone} />
				<InfoTile
					label="Opname terakhir (committed)"
					value={
						last?.committed_at
							? formatDateID(last.committed_at.slice(0, 10))
							: "Belum pernah"
					}
				/>
				<InfoTile
					label="Item perlu dihitung"
					value={`${itemCount ?? 0} item persediaan`}
				/>
			</div>

			<div className="flex flex-col gap-2 rounded-2xl border border-border-default bg-card p-5 shadow-[var(--shadow-level-2)] sm:flex-row sm:items-center sm:justify-between">
				<p className="max-w-xl text-[13px] text-muted-foreground">
					Stock opname mengunci stok fisik per item, menganchor Stok Awal/Akhir,
					dan menghilangkan kolom Selisih di laporan COGS.
				</p>
				<Link
					href="/warehouse/stock-take"
					className={buttonVariants({ variant: "default" })}
				>
					<Boxes className="size-4" />
					Buka Stock Opname
				</Link>
			</div>
		</div>
	);
}

function InfoTile({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone?: "emerald" | "amber" | "rose";
}) {
	const dot =
		tone === "emerald"
			? "bg-emerald-500"
			: tone === "amber"
				? "bg-amber-500"
				: tone === "rose"
					? "bg-rose-500"
					: null;
	return (
		<div className="rounded-2xl border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-1)]">
			<div className="eyebrow text-muted-foreground">{label}</div>
			<div className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
				{dot && <span className={`size-2 rounded-full ${dot}`} />}
				{value}
			</div>
		</div>
	);
}

function OpnameLink() {
	return (
		<Link
			href="/warehouse/stock-take"
			className="font-medium underline underline-offset-2 hover:opacity-80"
		>
			Stock Opname
		</Link>
	);
}

function MonthSwitcher({ ym, tab }: { ym: string; tab: Tab }) {
	const [year, month] = ym.split("-").map(Number);
	const prev = shiftMonth(ym, -1);
	const next = shiftMonth(ym, +1);
	const base = "/finance/persediaan-report";
	return (
		<div className="inline-flex h-9 items-center gap-0.5 rounded-full border border-border-subtle bg-card p-1 shadow-[var(--shadow-level-1)] md:border-transparent md:bg-secondary md:shadow-none">
			<Link
				href={`${base}?tab=${tab}&month=${prev}`}
				aria-label="Bulan sebelumnya"
				className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
			>
				<ChevronLeft className="h-4 w-4" />
			</Link>
			<div className="tabular flex h-7 items-center gap-1.5 px-2.5 text-[13px] font-medium text-foreground">
				<CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
				{ID_MONTH_NAMES[month - 1]} {year}
			</div>
			<Link
				href={`${base}?tab=${tab}&month=${next}`}
				aria-label="Bulan berikutnya"
				className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
			>
				<ChevronRight className="h-4 w-4" />
			</Link>
		</div>
	);
}

function Banner({
	tone,
	children,
}: {
	tone: "amber" | "rose";
	children: React.ReactNode;
}) {
	const cls =
		tone === "rose"
			? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
			: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300";
	return (
		<div
			className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] ${cls}`}
		>
			<AlertTriangle className="mt-0.5 size-4 shrink-0" />
			<span>{children}</span>
		</div>
	);
}
