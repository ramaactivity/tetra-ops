import {
	Archive,
	Banknote,
	Building2,
	CalendarRange,
	Coins,
	FileSpreadsheet,
	PlusCircle,
} from "lucide-react";
import Link from "next/link";
import { type StatItem, StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { buttonVariants } from "@/components/ui/button";
import { VendorsExplorer } from "@/components/vendors/vendors-explorer";
import { getCommissionsOverview } from "@/lib/finance/commissions-data";
import { formatRupiahCompact } from "@/lib/format";
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
	/** Sisa tagihan acara potongan langsung (vendor → Tetra). */
	owe: number;
	/** Komisi siap dibayar (Tetra → vendor), status sama dgn Finance → Komisi. */
	payable: number;
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
		id: string;
		vendor_contact_id: string | null;
		event_date: string;
		status: string;
		is_migrated_legacy: boolean | null;
		vendor_commission_mode: string | null;
		vendor_commission_amount: number | string | null;
		remaining_balance: number | string | null;
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
					"id, vendor_contact_id, event_date, status, is_migrated_legacy, vendor_commission_mode, vendor_commission_amount, remaining_balance",
				)
				.in("vendor_contact_id", vendorIds)
				.is("deleted_at", null);
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

	// Komisi: status sama persis dengan Finance → Komisi.
	const { rows: commRows } = await getCommissionsOverview(supabase);
	const payableEv = new Map(
		commRows
			.filter((r) => r.kind === "vendor" && r.status === "payable")
			.map((r) => [r.eventId, r.amount]),
	);
	// NUMERIC columns come back from PostgREST as JSON strings.
	const num = (v: number | string | null | undefined): number => {
		if (v == null) return 0;
		const n = typeof v === "string" ? Number(v) : v;
		return Number.isFinite(n) ? n : 0;
	};
	type Agg = {
		count: number;
		count_ytd: number;
		owe: number;
		payable: number;
		last_date: string | null;
	};
	const empty = (): Agg => ({
		count: 0,
		count_ytd: 0,
		owe: 0,
		payable: 0,
		last_date: null,
	});
	const stats = new Map<string, Agg>();
	for (const e of events) {
		if (!e.vendor_contact_id || e.status === "cancelled") continue;
		const cur = stats.get(e.vendor_contact_id) ?? empty();
		// Hitungan acara tanpa data migrasi lama; uang terbuka tetap dihitung.
		if (!e.is_migrated_legacy) {
			cur.count += 1;
			if (e.event_date >= ytdStart) cur.count_ytd += 1;
		}
		if (e.vendor_commission_mode === "upfront_cut")
			cur.owe += Math.max(0, num(e.remaining_balance));
		cur.payable += payableEv.get(e.id) ?? 0;
		if (!cur.last_date || e.event_date > cur.last_date)
			cur.last_date = e.event_date;
		stats.set(e.vendor_contact_id, cur);
	}
	const vendors: VendorRow[] = vendorList.map((v) => {
		const s = stats.get(v.id) ?? empty();
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
			owe: s.owe,
			payable: s.payable,
			last_event_date: s.last_date,
		};
	});
	const year = ytdStart.slice(0, 4);
	const sum = (k: "owe" | "payable" | "event_count_ytd") =>
		vendors.reduce((t, v) => t + v[k], 0);
	const kpiStats: StatItem[] = [
		{
			label: "Vendor aktif",
			value: vendors.filter((v) => v.is_active).length.toString(),
			hint: "terdaftar",
			icon: Building2,
		},
		{
			label: `Acara ${year}`,
			value: sum("event_count_ytd").toLocaleString("id-ID"),
			hint: "lewat vendor",
			icon: CalendarRange,
		},
		{
			label: "Belum disetor",
			value: formatRupiahCompact(sum("owe")),
			hint: "Vendor → Tetra · potongan langsung",
			icon: Banknote,
			accent: "emerald",
		},
		{
			label: "Komisi",
			value: formatRupiahCompact(sum("payable")),
			hint: "Siap dibayar · Tetra → vendor",
			icon: Coins,
			accent: "amber",
		},
	];

	const archiveToggle = (
		<Link
			href={showArchived ? "/vendors" : "/vendors?show_archived=1"}
			className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
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
				description="Semua vendor & WO rekanan. Buka satu vendor untuk melihat acaranya, tim & akses dasbor, dan uang yang masih terbuka."
				actions={
					<div className="flex items-center gap-2">
						<Link
							href="/contacts?type=vendor"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							<FileSpreadsheet className="size-4" />
							<span className="hidden sm:inline">Lihat kontak</span>
						</Link>
						<Link
							href="/vendors/new"
							className={buttonVariants({ variant: "default", size: "sm" })}
						>
							<PlusCircle className="size-4" />
							<span className="hidden sm:inline">Tambah vendor</span>
							<span className="sm:hidden">Tambah</span>
						</Link>
					</div>
				}
			/>

			<StatRow stats={kpiStats} />

			<VendorsExplorer vendors={vendors} toolbar={archiveToggle} />

			<p className="type-caption text-muted-foreground px-1">
				"Belum disetor" = sisa tagihan acara potongan langsung yang belum
				dibayar vendor. "Komisi siap dibayar" = komisi acara yang sudah ditutup,
				dibayar di Finance → Komisi.
			</p>
		</Container>
	);
}
