import {
	Archive,
	Building2,
	FileSpreadsheet,
	PlusCircle,
	Search,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { VendorsListTable } from "@/components/vendors/vendors-list-table";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type VendorRow = {
	vendor_id: string;
	name: string;
	default_pic_name: string | null;
	default_pic_contact: string | null;
	commission_rate_default: number | null;
	payment_terms: string | null;
	company_address: string | null;
	is_active: boolean;
	event_count: number;
	event_count_ytd: number;
	commission_ytd: number;
	gross_revenue_ytd: number;
	last_event_date: string | null;
};

export default async function VendorsListPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; show_archived?: string }>;
}) {
	const params = await searchParams;
	const q = params.q?.trim() ?? "";
	const showArchived = params.show_archived === "1";

	const supabase = await createClient();

	// Vendor master + aggregates (single read from view)
	let query = supabase
		.from("vendor_summary_v")
		.select(
			"vendor_id, name, default_pic_name, default_pic_contact, commission_rate_default, payment_terms, company_address, is_active, event_count, event_count_ytd, commission_ytd, gross_revenue_ytd, last_event_date",
		)
		.order("name", { ascending: true });

	if (!showArchived) query = query.eq("is_active", true);
	if (q) query = query.ilike("name", `%${q}%`);

	const { data, error } = await query;

	if (error) {
		return (
			<div className="rounded-md border border-destructive bg-destructive/10 p-4">
				<p className="text-fluid-body font-medium text-destructive">
					Gagal memuat vendor: {error.message}
				</p>
			</div>
		);
	}

	const vendors = (data ?? []) as VendorRow[];

	// Aggregate top-of-page KPIs
	const totalVendors = vendors.filter((v) => v.is_active).length;
	const totalEventsYTD = vendors.reduce((s, v) => s + (v.event_count_ytd ?? 0), 0);
	const totalCommissionYTD = vendors.reduce(
		(s, v) => s + (v.commission_ytd ?? 0),
		0,
	);
	const totalGrossYTD = vendors.reduce(
		(s, v) => s + (v.gross_revenue_ytd ?? 0),
		0,
	);

	return (
		<div className="space-y-5">
			<SectionHeader
				as="h2"
				title="Vendors"
				description="Master vendor / partner organizer. Tiap booking dengan channel = Vendor otomatis terhubung ke entry di sini. Commission default + PIC bisa di-set sekali, dipakai auto-fill di form booking."
				actions={
					<div className="flex items-center gap-2">
						<Link
							href="/settings/contacts?type=vendor"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<FileSpreadsheet className="size-4" />
							<span className="hidden sm:inline">View contacts</span>
						</Link>
						<Link
							href="/settings/vendors/new"
							className={buttonVariants({ variant: "default", size: "sm" })}
						>
							<PlusCircle className="size-4" />
							<span className="hidden sm:inline">New vendor</span>
							<span className="sm:hidden">New</span>
						</Link>
					</div>
				}
			/>

			{/* KPI strip */}
			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<KpiTile
					label="Vendor aktif"
					value={totalVendors.toString()}
					hint="Total terdaftar"
				/>
				<KpiTile
					label="Event YTD"
					value={totalEventsYTD.toLocaleString("id-ID")}
					hint="Tahun berjalan"
				/>
				<KpiTile
					label="Gross revenue YTD"
					value={formatRupiah(totalGrossYTD)}
					hint="Dari semua vendor"
				/>
				<KpiTile
					label="Komisi YTD"
					value={formatRupiah(totalCommissionYTD)}
					hint="Total payable"
				/>
			</dl>

			{/* Filter row */}
			<div className="flex flex-wrap items-center gap-2">
				<form
					method="get"
					action="/settings/vendors"
					className="relative min-w-[200px] flex-1 sm:max-w-xs"
				>
					<Search
						className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
						aria-hidden
					/>
					<input
						type="search"
						name="q"
						defaultValue={q}
						placeholder="Cari nama vendor…"
						className="h-9 w-full rounded-md border border-border-default bg-surface-2 pl-8 pr-3 text-fluid-body placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					/>
					{showArchived && <input type="hidden" name="show_archived" value="1" />}
				</form>

				<Link
					href={
						showArchived
							? q
								? `/settings/vendors?q=${encodeURIComponent(q)}`
								: "/settings/vendors"
							: q
								? `/settings/vendors?q=${encodeURIComponent(q)}&show_archived=1`
								: "/settings/vendors?show_archived=1"
					}
					className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-fluid-caption font-medium transition-colors ${
						showArchived
							? "border-primary/40 bg-primary/10 text-primary"
							: "border-border-default bg-surface-2 text-muted-foreground hover:text-foreground"
					}`}
					aria-pressed={showArchived}
				>
					<Archive className="size-3.5" />
					{showArchived ? "Hide archived" : "Show archived"}
				</Link>
			</div>

			{vendors.length === 0 ? (
				<EmptyState
					icon={Building2}
					title={
						q
							? "Vendor tidak ditemukan"
							: "Belum ada vendor terdaftar"
					}
					description={
						q
							? "Coba kata kunci lain atau buka semua tanpa filter."
							: "Tambah vendor baru, atau biarkan otomatis terbuat saat owner input booking dengan channel = Vendor."
					}
					action={
						!q && (
							<Link
								href="/settings/vendors/new"
								className={buttonVariants({ variant: "default", size: "sm" })}
							>
								<PlusCircle className="size-4" />
								Tambah vendor pertama
							</Link>
						)
					}
				/>
			) : (
				<VendorsListTable vendors={vendors} />
			)}

			<p className="text-fluid-caption text-muted-foreground">
				Data diagregat dari <code className="rounded bg-muted px-1 py-0.5 text-[11px]">vendor_summary_v</code>{" "}
				(join <code className="rounded bg-muted px-1 py-0.5 text-[11px]">contacts</code> ×{" "}
				<code className="rounded bg-muted px-1 py-0.5 text-[11px]">events</code> by{" "}
				<code className="rounded bg-muted px-1 py-0.5 text-[11px]">vendor_contact_id</code>).
				YTD = year-to-date sesuai tanggal event. Komisi YTD dihitung dari{" "}
				<code className="rounded bg-muted px-1 py-0.5 text-[11px]">events.vendor_commission_amount</code>{" "}
				(populated saat settlement).
			</p>
		</div>
	);
}

function KpiTile({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint: string;
}) {
	return (
		<div className="rounded-lg border border-border-default bg-card p-4">
			<dt className="eyebrow truncate">{label}</dt>
			<dd className="tabular display-tight mt-1.5 text-[22px] font-semibold leading-[1.1] text-foreground">
				{value}
			</dd>
			<p className="text-[12px] leading-snug text-muted-foreground">{hint}</p>
		</div>
	);
}
