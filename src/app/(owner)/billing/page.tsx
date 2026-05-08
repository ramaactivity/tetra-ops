import {
	AlertTriangle,
	FileText,
	Receipt,
	TrendingUp,
	Wallet,
} from "lucide-react";
import { BillingFilterBar } from "@/components/billing/billing-filter-bar";
import {
	BillingListTable,
	type EventBillingRow,
} from "@/components/billing/billing-list-table";
import { BillingTabs } from "@/components/billing/billing-tabs";
import type { WhatsAppTemplate } from "@/components/booking/send-wa-button";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

function lastDayOfMonth(year: number, month: number): string {
	const d = new Date(year, month, 0).getDate();
	return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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
						<BillingListTable events={events} templates={templates} />
					</div>
				)}
			</div>
		</Container>
	);
}
