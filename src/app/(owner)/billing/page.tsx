import {
	AlertTriangle,
	FileText,
	Receipt,
	TrendingUp,
	Wallet,
} from "lucide-react";
import Link from "next/link";
import { PaymentStatusBadge } from "@/components/badges/status-badge";
import { BillingFilterBar } from "@/components/billing/billing-filter-bar";
import { BillingTabs } from "@/components/billing/billing-tabs";
import {
	SendWhatsAppButton,
	type WhatsAppTemplate,
} from "@/components/booking/send-wa-button";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	ResponsiveTable,
	type ResponsiveTableColumn,
} from "@/components/ui/responsive-table";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type EventBillingRow = {
	id: string;
	project_id: string;
	client_name: string;
	client_wa: string;
	event_date: string;
	setup_time: string | null;
	start_time: string | null;
	venue_name: string;
	due_date: string | null;
	grand_total: number;
	total_paid: number;
	remaining_balance: number;
	payment_status: string;
};

function dueDateColor(due: string | null, eventDate: string, status: string) {
	if (status === "paid") return "text-muted-foreground";
	const ref = due ?? eventDate;
	if (!ref) return "text-muted-foreground";
	const refDate = new Date(ref);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const diffDays = Math.round(
		(refDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
	);
	if (diffDays < 0) return "text-rose-500";
	if (diffDays <= 3) return "text-amber-500";
	return "text-emerald-500";
}

export default async function BillingPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; tab?: string; month?: string }>;
}) {
	const params = await searchParams;
	const q = params.q?.trim() ?? "";
	const tab = params.tab?.trim() ?? "all";
	const month = params.month?.trim() ?? "";

	const supabase = await createClient();

	const today = new Date();
	const todayISO = today.toISOString().slice(0, 10);
	const ymStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
	const ymEnd = lastDayOfMonth(today.getFullYear(), today.getMonth() + 1);

	// List query
	let listQuery = supabase
		.from("events")
		.select(
			"id, project_id, client_name, client_wa, event_date, setup_time, start_time, venue_name, due_date, grand_total, total_paid, remaining_balance, payment_status",
		)
		.is("deleted_at", null)
		.order("event_date", { ascending: false })
		.limit(100);

	if (q) listQuery = listQuery.ilike("client_name", `%${q}%`);
	if (month && /^\d{4}-\d{2}$/.test(month)) {
		const [y, m] = month.split("-").map(Number);
		const startISO = `${month}-01`;
		const endISO = lastDayOfMonth(y, m);
		listQuery = listQuery
			.gte("event_date", startISO)
			.lte("event_date", endISO);
	}

	if (tab === "unpaid") listQuery = listQuery.eq("payment_status", "unpaid");
	else if (tab === "dp_partial")
		listQuery = listQuery.in("payment_status", ["dp", "partial"]);
	else if (tab === "paid") listQuery = listQuery.eq("payment_status", "paid");
	else if (tab === "overdue")
		listQuery = listQuery.eq("payment_status", "overdue");

	const [
		listResult,
		hangingResult,
		overdueResult,
		collectedResult,
		monthOmzetResult,
		tabCountsResult,
		templatesResult,
	] = await Promise.all([
		listQuery,
		// Hanging = remaining > 0 (anything not paid)
		supabase
			.from("events")
			.select("remaining_balance")
			.is("deleted_at", null)
			.neq("payment_status", "paid")
			.gt("remaining_balance", 0),
		// Overdue specifically
		supabase
			.from("events")
			.select("remaining_balance")
			.is("deleted_at", null)
			.eq("payment_status", "overdue"),
		// Collected this month
		supabase
			.from("payments")
			.select("amount")
			.eq("is_reversed", false)
			.gte("payment_date", ymStart)
			.lte("payment_date", ymEnd),
		// Estimated omzet this month (sum of grand_total of events whose event_date is this month)
		supabase
			.from("events")
			.select("grand_total")
			.is("deleted_at", null)
			.gte("event_date", ymStart)
			.lte("event_date", ymEnd),
		// Tab counts
		supabase
			.from("events")
			.select("payment_status")
			.is("deleted_at", null),
		// WhatsApp templates
		supabase
			.from("whatsapp_templates")
			.select("code, name, description, template_body")
			.eq("is_active", true)
			.order("display_order", { ascending: true }),
	]);

	if (listResult.error) {
		return (
			<Container size="xl">
				<div className="rounded-md border border-destructive bg-destructive/10 p-4">
					<p className="text-fluid-body font-medium text-destructive">
						Gagal memuat billing: {listResult.error.message}
					</p>
				</div>
			</Container>
		);
	}

	const events = (listResult.data ?? []) as EventBillingRow[];
	const templates = (templatesResult.data ?? []) as WhatsAppTemplate[];

	const hanging = (hangingResult.data ?? []).reduce(
		(s, r) => s + (r.remaining_balance ?? 0),
		0,
	);
	const overdueAmount = (overdueResult.data ?? []).reduce(
		(s, r) => s + (r.remaining_balance ?? 0),
		0,
	);
	const collected = (collectedResult.data ?? []).reduce(
		(s, p) => s + (p.amount ?? 0),
		0,
	);
	const monthOmzet = (monthOmzetResult.data ?? []).reduce(
		(s, e) => s + (e.grand_total ?? 0),
		0,
	);

	const tabCounts: Record<string, number> = {
		all: 0,
		unpaid: 0,
		dp_partial: 0,
		paid: 0,
		overdue: 0,
	};
	for (const row of tabCountsResult.data ?? []) {
		const ps = row.payment_status as string;
		tabCounts.all++;
		if (ps === "unpaid") tabCounts.unpaid++;
		else if (ps === "dp" || ps === "partial") tabCounts.dp_partial++;
		else if (ps === "paid") tabCounts.paid++;
		else if (ps === "overdue") tabCounts.overdue++;
	}

	return (
		<Container size="xl" className="space-y-6">
			<SectionHeader
				title="Billing"
				description="Track pembayaran dan piutang dari semua event."
			/>

			<dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard
					label="Uang Menggantung"
					value={formatRupiah(hanging)}
					hint="Sisa tagihan aktif"
					icon={Wallet}
					accent={hanging >= 15_000_000 ? "rose" : "amber"}
				/>
				<KpiCard
					label="Overdue"
					value={formatRupiah(overdueAmount)}
					hint="Lewat jatuh tempo"
					icon={AlertTriangle}
					accent="rose"
				/>
				<KpiCard
					label="Uang Masuk MTD"
					value={formatRupiah(collected)}
					hint="Total payment terverifikasi bulan ini"
					icon={TrendingUp}
					accent="emerald"
				/>
				<KpiCard
					label="Estimasi Omzet"
					value={formatRupiah(monthOmzet)}
					hint="Total grand_total event bulan ini"
					icon={Receipt}
					accent="primary"
				/>
			</dl>

			<div className="space-y-4">
				<BillingTabs current={tab} counts={tabCounts} />

				<BillingFilterBar defaultQ={q} defaultMonth={month} />

				{events.length === 0 ? (
					<EmptyState
						icon={FileText}
						title="Tidak ada invoice"
						description={
							q || month || tab !== "all"
								? "Coba ubah filter atau ganti tab."
								: "Bikin event dulu di Operations untuk mulai billing."
						}
					/>
				) : (
					<div className="rounded-lg border border-border-default bg-surface-2 p-3 md:p-0">
						<ResponsiveTable<EventBillingRow>
							keyExtractor={(ev) => ev.id}
							rows={events}
							columns={buildBillingColumns({ templates })}
						/>
					</div>
				)}
			</div>
		</Container>
	);
}

function buildBillingColumns({
	templates,
}: {
	templates: WhatsAppTemplate[];
}): ResponsiveTableColumn<EventBillingRow>[] {
	return [
		{
			key: "client",
			header: "Klien",
			render: (ev) => (
				<div className="space-y-0.5">
					<div className="text-fluid-body font-medium">{ev.client_name}</div>
					<Link
						href={`/operations/${ev.project_id}`}
						className="tabular text-fluid-caption text-primary hover:underline"
					>
						{ev.project_id}
					</Link>
				</div>
			),
		},
		{
			key: "event_date",
			header: "Event Date",
			mobileLabel: "Tanggal",
			render: (ev) => (
				<span className="tabular text-fluid-caption text-muted-foreground">
					{formatDateID(ev.event_date)}
				</span>
			),
		},
		{
			key: "due_date",
			header: "Due Date",
			mobileLabel: "Jatuh Tempo",
			render: (ev) => {
				const due = ev.due_date ?? ev.event_date;
				return (
					<span
						className={cn(
							"tabular text-fluid-caption",
							dueDateColor(ev.due_date, ev.event_date, ev.payment_status),
						)}
					>
						{due ? formatDateID(due) : "—"}
					</span>
				);
			},
		},
		{
			key: "grand_total",
			header: "Total",
			align: "right",
			hideOnMobile: true,
			render: (ev) => (
				<span className="tabular font-medium">
					{ev.grand_total ? formatRupiah(ev.grand_total) : "—"}
				</span>
			),
		},
		{
			key: "total_paid",
			header: "Paid",
			align: "right",
			hideOnMobile: true,
			render: (ev) => (
				<span className="tabular text-emerald-500">
					{ev.total_paid > 0 ? formatRupiah(ev.total_paid) : "—"}
				</span>
			),
		},
		{
			key: "remaining_balance",
			header: "Sisa",
			align: "right",
			render: (ev) =>
				ev.remaining_balance > 0 ? (
					<span className="tabular font-medium text-foreground">
						{formatRupiah(ev.remaining_balance)}
					</span>
				) : (
					<span className="tabular text-muted-foreground">—</span>
				),
		},
		{
			key: "payment_status",
			header: "Status",
			render: (ev) => <PaymentStatusBadge status={ev.payment_status} />,
		},
		{
			key: "actions",
			header: "Actions",
			align: "right",
			render: (ev) => (
				<div className="flex items-center justify-end gap-1">
					<SendWhatsAppButton
						event={{
							project_id: ev.project_id,
							client_name: ev.client_name,
							client_wa: ev.client_wa,
							event_date: ev.event_date,
							setup_time: ev.setup_time,
							start_time: ev.start_time,
							venue_name: ev.venue_name,
							due_date: ev.due_date,
							total_paid: ev.total_paid,
							remaining_balance: ev.remaining_balance,
						}}
						templates={templates}
						size="sm"
					/>
					<Link
						href={`/operations/${ev.project_id}/payments`}
						title="Log payment / lihat history"
						className="inline-flex h-8 items-center gap-1 rounded-md border border-border-default bg-surface-2 px-2.5 text-fluid-caption font-medium text-foreground transition-colors hover:bg-surface-3"
					>
						<Receipt className="size-3.5" />
						Payments
					</Link>
				</div>
			),
		},
	];
}
