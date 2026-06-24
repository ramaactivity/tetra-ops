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
						label: "Cost of Goods Sold",
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

			{tab === "opname" && <OpnameView supabase={supabase} />}
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
			{/* Degradation banners */}
			{flags.negativeSkus.length > 0 && (
				<Banner tone="rose">
					<strong>{flags.negativeSkus.length} item stok minus</strong> (
					{flags.negativeSkus.join(", ")}) — konsumsi tercatat tanpa pembelian/
					opname pembanding, jadi nilai Stok Awal/Akhir-nya tampak ekstrem.
					Lakukan <OpnameLink /> untuk koreksi.
				</Banner>
			)}
			{!flags.hasThisOpname && (
				<Banner tone="amber">
					Belum ada Stock Opname dalam {label}. Stok Akhir memakai stok sistem
					(belum diaudit fisik). Jalankan <OpnameLink /> untuk mengunci angka
					akhir & menangkap selisih antara stok fisik dan pemakaian tercatat.
				</Banner>
			)}
			{!flags.hasPriorOpname && (
				<Banner tone="amber">
					Belum ada Stock Opname sebelum {label}. Stok Awal diturunkan dari stok
					saat ini dikurangi mutasi bulan ini — estimasi, bukan angka audit.
				</Banner>
			)}

			<KpiRow className="lg:grid-cols-5">
				<KpiCard
					label="Total COGS"
					value={rpCompact(data.kpis.totalCogs)}
					hint="konsumsi event tercatat"
					icon={Coins}
					accent="primary"
				/>
				<KpiCard
					label="Mediaset"
					value={rpCompact(data.kpis.mediasetCogs)}
					hint="COGS media"
					icon={Layers}
					accent="sky"
				/>
				<KpiCard
					label="Sleeve"
					value={rpCompact(data.kpis.sleeveCogs)}
					hint="COGS sleeve"
					icon={Layers}
					accent="amber"
				/>
				<KpiCard
					label="Flashdisk"
					value={rpCompact(data.kpis.flashdiskCogs)}
					hint="COGS flashdisk + box"
					icon={Layers}
					accent="rose"
				/>
				<KpiCard
					label="Nilai Persediaan Akhir"
					value={rpCompact(data.kpis.closingValue)}
					hint={`${data.itemCount} item · on-hand × WAC`}
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

			<RollforwardTable data={data} />
		</div>
	);
}

async function OpnameView({
	supabase,
}: {
	supabase: Awaited<ReturnType<typeof createClient>>;
}) {
	const { data: last } = await supabase
		.from("stock_takes")
		.select("committed_at")
		.eq("status", "committed")
		.order("committed_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	return (
		<div className="space-y-3">
			<Banner tone="amber">
				Stok Awal & Akhir paling akurat kalau berasal dari Stock Opname (hitung
				fisik). Tanpa opname, laporan COGS memakai stok sistem yang bisa
				melenceng dari kenyataan.
			</Banner>

			<div className="rounded-2xl border border-border-default bg-card p-5 shadow-[var(--shadow-level-2)]">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1">
						<div className="eyebrow text-muted-foreground">Opname terakhir</div>
						<div className="text-[15px] font-semibold text-foreground">
							{last?.committed_at
								? formatDateID(last.committed_at.slice(0, 10))
								: "Belum pernah ada opname"}
						</div>
						<div className="text-[12px] text-muted-foreground">
							{last?.committed_at
								? "Stock opname mengunci stok fisik per item & menangkap selisih."
								: "Jalankan opname pertama untuk menganchor valuasi persediaan."}
						</div>
					</div>
					<Link
						href="/warehouse/stock-take"
						className={buttonVariants({ variant: "default" })}
					>
						<Boxes className="size-4" />
						Buka Stock Opname
					</Link>
				</div>
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
