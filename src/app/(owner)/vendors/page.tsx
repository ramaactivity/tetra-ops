import {
	Archive,
	Building2,
	CalendarRange,
	Coins,
	FileSpreadsheet,
	PlusCircle,
	TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { type StatItem, StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { buttonVariants } from "@/components/ui/button";
import { VendorsExplorer } from "@/components/vendors/vendors-explorer";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type VendorRow = {
	vendor_id: string;
	name: string;
	default_pic_name: string | null;
	default_pic_contact: string | null;
	commission_mode: "commission" | "upfront_cut" | null;
	commission_value_type: "percent" | "flat" | null;
	commission_value_default: number | null;
	commission_rate_default: number | null; // legacy back-compat
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
	searchParams: Promise<{ show_archived?: string }>;
}) {
	const params = await searchParams;
	const showArchived = params.show_archived === "1";

	const supabase = await createClient();

	// 1) Read vendor master from contacts table directly. Wrapped with
	//    try/catch + visible error rendering — production "Server
	//    Components render" digests hid the actual cause, so this surfaces
	//    Supabase/PostgREST error details directly on the page.
	let vendorQuery = supabase
		.from("contacts")
		.select(
			"id, name, default_pic_name, default_pic_contact, commission_mode, commission_value_type, commission_value_default, commission_rate_default, payment_terms, company_address, is_active",
		)
		.eq("type", "vendor")
		.order("name", { ascending: true });

	if (!showArchived) vendorQuery = vendorQuery.eq("is_active", true);

	let vendorContacts: unknown[] | null = null;
	let queryError: {
		stage: string;
		message: string;
		details?: string;
		hint?: string;
		code?: string;
	} | null = null;
	try {
		const res = await vendorQuery;
		if (res.error) {
			queryError = {
				stage: "contacts.select",
				message: res.error.message,
				details: res.error.details,
				hint: res.error.hint,
				code: res.error.code,
			};
		} else {
			vendorContacts = res.data ?? [];
		}
	} catch (err) {
		queryError = {
			stage: "contacts.select.exception",
			message: err instanceof Error ? err.message : String(err),
			details: err instanceof Error ? err.stack : undefined,
		};
	}

	if (queryError) {
		return (
			<div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/60 p-5 dark:border-rose-900 dark:bg-rose-950/30">
				<p className="text-[14px] font-semibold text-rose-900 dark:text-rose-100">
					Vendors query gagal — {queryError.stage}
				</p>
				<dl className="space-y-1 text-[12px] text-rose-800/90 dark:text-rose-200/90">
					<div>
						<dt className="font-semibold inline">message: </dt>
						<dd className="inline font-mono">{queryError.message}</dd>
					</div>
					{queryError.code && (
						<div>
							<dt className="font-semibold inline">code: </dt>
							<dd className="inline font-mono">{queryError.code}</dd>
						</div>
					)}
					{queryError.hint && (
						<div>
							<dt className="font-semibold inline">hint: </dt>
							<dd className="inline font-mono">{queryError.hint}</dd>
						</div>
					)}
					{queryError.details && (
						<div>
							<dt className="font-semibold inline">details: </dt>
							<dd className="inline font-mono whitespace-pre-wrap break-all">
								{queryError.details}
							</dd>
						</div>
					)}
				</dl>
			</div>
		);
	}

	const vendorList = (vendorContacts ?? []) as Array<{
		id: string;
		name: string;
		default_pic_name: string | null;
		default_pic_contact: string | null;
		commission_mode: "commission" | "upfront_cut" | null;
		commission_value_type: "percent" | "flat" | null;
		commission_value_default: number | string | null;
		commission_rate_default: number | string | null;
		payment_terms: string | null;
		company_address: string | null;
		is_active: boolean;
	}>;

	// 2) Aggregate per-vendor stats from events. Single query indexed by
	//    vendor_contact_id (idx_events_vendor_contact_id). YTD = current
	//    calendar year. is_migrated_legacy excluded — legacy bookings
	//    don't have reliable commission data.
	const ytdStart = `${new Date().getFullYear()}-01-01`;
	const vendorIds = vendorList.map((v) => v.id);

	type EventAgg = {
		vendor_contact_id: string | null;
		event_date: string;
		vendor_commission_amount: number | string | null;
		grand_total: number | string | null;
	};
	let events: EventAgg[] = [];
	let eventsError: {
		message: string;
		details?: string;
		hint?: string;
		code?: string;
	} | null = null;
	if (vendorIds.length > 0) {
		try {
			const res = await supabase
				.from("events")
				.select(
					"vendor_contact_id, event_date, vendor_commission_amount, grand_total",
				)
				.in("vendor_contact_id", vendorIds)
				.is("deleted_at", null)
				.eq("is_migrated_legacy", false);
			if (res.error) {
				eventsError = {
					message: res.error.message,
					details: res.error.details,
					hint: res.error.hint,
					code: res.error.code,
				};
			} else {
				events = (res.data ?? []) as EventAgg[];
			}
		} catch (err) {
			eventsError = {
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}

	if (eventsError) {
		return (
			<div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/60 p-5 dark:border-rose-900 dark:bg-rose-950/30">
				<p className="text-[14px] font-semibold text-rose-900 dark:text-rose-100">
					Vendors query gagal — events.select
				</p>
				<dl className="space-y-1 text-[12px] text-rose-800/90 dark:text-rose-200/90">
					<div>
						<dt className="font-semibold inline">message: </dt>
						<dd className="inline font-mono">{eventsError.message}</dd>
					</div>
					{eventsError.code && (
						<div>
							<dt className="font-semibold inline">code: </dt>
							<dd className="inline font-mono">{eventsError.code}</dd>
						</div>
					)}
					{eventsError.hint && (
						<div>
							<dt className="font-semibold inline">hint: </dt>
							<dd className="inline font-mono">{eventsError.hint}</dd>
						</div>
					)}
					{eventsError.details && (
						<div>
							<dt className="font-semibold inline">details: </dt>
							<dd className="inline font-mono whitespace-pre-wrap break-all">
								{eventsError.details}
							</dd>
						</div>
					)}
				</dl>
			</div>
		);
	}

	// Bucket events by vendor_contact_id, accumulate in O(N).
	const stats = new Map<
		string,
		{
			count: number;
			count_ytd: number;
			commission_ytd: number;
			gross_ytd: number;
			last_date: string | null;
		}
	>();
	// NUMERIC columns come back from PostgREST as JSON strings. Coerce
	// once to avoid `"0" + "0" === "00"` string concat in the reducer.
	const num = (v: number | string | null | undefined): number => {
		if (v == null) return 0;
		const n = typeof v === "string" ? Number(v) : v;
		return Number.isFinite(n) ? n : 0;
	};

	for (const e of events) {
		if (!e.vendor_contact_id) continue;
		const cur = stats.get(e.vendor_contact_id) ?? {
			count: 0,
			count_ytd: 0,
			commission_ytd: 0,
			gross_ytd: 0,
			last_date: null,
		};
		cur.count += 1;
		if (e.event_date >= ytdStart) {
			cur.count_ytd += 1;
			cur.commission_ytd += num(e.vendor_commission_amount);
			cur.gross_ytd += num(e.grand_total);
		}
		if (!cur.last_date || e.event_date > cur.last_date) {
			cur.last_date = e.event_date;
		}
		stats.set(e.vendor_contact_id, cur);
	}

	const vendors: VendorRow[] = vendorList.map((v) => {
		const s = stats.get(v.id) ?? {
			count: 0,
			count_ytd: 0,
			commission_ytd: 0,
			gross_ytd: 0,
			last_date: null,
		};
		return {
			vendor_id: v.id,
			name: v.name,
			default_pic_name: v.default_pic_name,
			default_pic_contact: v.default_pic_contact,
			commission_mode: v.commission_mode,
			commission_value_type: v.commission_value_type,
			commission_value_default:
				v.commission_value_default == null
					? null
					: num(v.commission_value_default),
			commission_rate_default:
				v.commission_rate_default == null
					? null
					: num(v.commission_rate_default),
			payment_terms: v.payment_terms,
			company_address: v.company_address,
			is_active: v.is_active,
			event_count: s.count,
			event_count_ytd: s.count_ytd,
			commission_ytd: s.commission_ytd,
			gross_revenue_ytd: s.gross_ytd,
			last_event_date: s.last_date,
		};
	});

	// Top-of-page KPIs
	const totalVendors = vendors.filter((v) => v.is_active).length;
	const totalEventsYTD = vendors.reduce((s, v) => s + v.event_count_ytd, 0);
	const totalCommissionYTD = vendors.reduce((s, v) => s + v.commission_ytd, 0);
	const totalGrossYTD = vendors.reduce((s, v) => s + v.gross_revenue_ytd, 0);

	const kpiStats: StatItem[] = [
		{
			label: "Vendor Aktif",
			value: totalVendors.toString(),
			hint: "total terdaftar",
			icon: Building2,
		},
		{
			label: "Event YTD",
			value: totalEventsYTD.toLocaleString("id-ID"),
			hint: "tahun berjalan",
			icon: CalendarRange,
		},
		{
			label: "Gross Revenue YTD",
			value: formatRupiah(totalGrossYTD),
			hint: "dari semua vendor",
			icon: TrendingUp,
			accent: "info",
		},
		{
			label: "Komisi YTD",
			value: formatRupiah(totalCommissionYTD),
			hint: "total payable",
			icon: Coins,
			accent: "amber",
		},
	];

	const archiveToggle = (
		<Link
			href={showArchived ? "/vendors" : "/vendors?show_archived=1"}
			className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors ${
				showArchived
					? "border-[#059669] bg-[#059669] text-white"
					: "border-border-default bg-card text-muted-foreground hover:text-foreground hover:bg-secondary"
			}`}
			aria-pressed={showArchived}
		>
			<Archive className="size-3.5" />
			{showArchived ? "Sembunyikan arsip" : "Tampilkan arsip"}
		</Link>
	);

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				as="h1"
				eyebrow="Kontak"
				title="Vendor"
				description="Master vendor / partner organizer. Tiap booking channel = Vendor otomatis terhubung ke sini. Commission default + PIC dipakai auto-fill di form booking."
				actions={
					<div className="flex items-center gap-2">
						<Link
							href="/contacts?type=vendor"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<FileSpreadsheet className="size-4" />
							<span className="hidden sm:inline">Lihat Kontak</span>
						</Link>
						<Link
							href="/vendors/new"
							className={buttonVariants({ variant: "default", size: "sm" })}
						>
							<PlusCircle className="size-4" />
							<span className="hidden sm:inline">Tambah Vendor</span>
							<span className="sm:hidden">Tambah</span>
						</Link>
					</div>
				}
			/>

			<StatRow stats={kpiStats} />

			<VendorsExplorer vendors={vendors} toolbar={archiveToggle} />

			<p className="text-fluid-caption text-muted-foreground">
				Aggregate dihitung dari{" "}
				<code className="rounded bg-muted px-1 py-0.5 text-[11px]">
					contacts
				</code>{" "}
				(type=vendor) ×{" "}
				<code className="rounded bg-muted px-1 py-0.5 text-[11px]">events</code>{" "}
				(vendor_contact_id). YTD = year-to-date sesuai tanggal event. Komisi YTD
				dihitung dari{" "}
				<code className="rounded bg-muted px-1 py-0.5 text-[11px]">
					events.vendor_commission_amount
				</code>{" "}
				(populated saat settlement).
			</p>
		</Container>
	);
}
