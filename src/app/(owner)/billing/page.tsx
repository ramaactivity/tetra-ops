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
import { KpiCard } from "@/components/operations/kpi-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
	event_date: string;
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
			"id, project_id, client_name, event_date, due_date, grand_total, total_paid, remaining_balance, payment_status",
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
	] = await Promise.all([
		listQuery,
		// Hanging = remaining > 0 (unpaid/dp/partial/overdue)
		supabase
			.from("events")
			.select("remaining_balance")
			.is("deleted_at", null)
			.in("payment_status", ["unpaid", "dp", "partial", "overdue"])
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
	]);

	if (listResult.error) {
		return (
			<div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
				<div className="border-destructive bg-destructive/10 rounded-md border p-4">
					<p className="text-destructive text-sm font-medium">
						Gagal memuat billing: {listResult.error.message}
					</p>
				</div>
			</div>
		);
	}

	const events = (listResult.data ?? []) as EventBillingRow[];

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
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-1">
				<h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
				<p className="text-muted-foreground text-sm">
					Track pembayaran dan piutang dari semua event.
				</p>
			</div>

			<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
					<div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed p-16 text-center">
						<FileText className="text-muted-foreground h-10 w-10" />
						<div className="space-y-1">
							<h3 className="font-medium">Tidak ada invoice</h3>
							<p className="text-muted-foreground text-sm">
								{q || month || tab !== "all"
									? "Coba ubah filter atau ganti tab."
									: "Bikin event dulu di Operations untuk mulai billing."}
							</p>
						</div>
					</div>
				) : (
					<div className="border-border bg-card overflow-hidden rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Klien</TableHead>
									<TableHead>Event Date</TableHead>
									<TableHead>Due Date</TableHead>
									<TableHead className="text-right">Total</TableHead>
									<TableHead className="text-right">Paid</TableHead>
									<TableHead className="text-right">Sisa</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="w-[120px] text-right">
										Actions
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{events.map((ev) => {
									const due = ev.due_date ?? ev.event_date;
									return (
										<TableRow key={ev.id}>
											<TableCell>
												<div className="space-y-0.5">
													<div className="text-sm font-medium">
														{ev.client_name}
													</div>
													<Link
														href={`/operations/${ev.project_id}`}
														className="text-primary tabular text-xs hover:underline"
													>
														{ev.project_id}
													</Link>
												</div>
											</TableCell>
											<TableCell className="tabular text-muted-foreground text-sm">
												{formatDateID(ev.event_date)}
											</TableCell>
											<TableCell
												className={cn(
													"tabular text-sm",
													dueDateColor(
														ev.due_date,
														ev.event_date,
														ev.payment_status,
													),
												)}
											>
												{due ? formatDateID(due) : "—"}
											</TableCell>
											<TableCell className="tabular text-right text-sm font-medium">
												{ev.grand_total
													? formatRupiah(ev.grand_total)
													: "—"}
											</TableCell>
											<TableCell className="tabular text-emerald-500 text-right text-sm">
												{ev.total_paid > 0
													? formatRupiah(ev.total_paid)
													: "—"}
											</TableCell>
											<TableCell className="tabular text-right text-sm font-medium">
												{ev.remaining_balance > 0 ? (
													<span className="text-foreground">
														{formatRupiah(ev.remaining_balance)}
													</span>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</TableCell>
											<TableCell>
												<PaymentStatusBadge status={ev.payment_status} />
											</TableCell>
											<TableCell>
												<div className="flex items-center justify-end gap-1">
													<Link
														href={`/operations/${ev.project_id}/payments`}
														title="Log payment / lihat history"
														className="border-border bg-card hover:bg-muted text-foreground inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium"
													>
														<Receipt className="h-3.5 w-3.5" />
														Payments
													</Link>
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}
			</div>
		</div>
	);
}
