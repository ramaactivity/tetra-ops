import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	type BankAccountOption,
	PaymentForm,
} from "@/components/billing/payment-form";
import {
	PaymentList,
	type PaymentRow,
} from "@/components/billing/payment-list";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { MoneyAmount } from "@/components/ui/money-amount";
import { PAYMENT_STATUS_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const STATUS_VARIANT: Record<
	string,
	"default" | "secondary" | "outline" | "destructive" | "success"
> = {
	paid: "success",
	overpaid: "success",
	overdue: "destructive",
	dp: "default",
	partial: "default",
	unpaid: "outline",
};

export default async function ManagePaymentsPage({
	params,
}: {
	params: Promise<{ projectId: string }>;
}) {
	const { projectId } = await params;
	const supabase = await createClient();

	const { data: event } = await supabase
		.from("events")
		.select(
			"id, project_id, client_name, grand_total, total_paid, remaining_balance, payment_status, due_date",
		)
		.eq("project_id", projectId)
		.maybeSingle();
	if (!event) notFound();

	const [{ data: paymentsData }, { data: banks }] = await Promise.all([
		supabase
			.from("payments")
			.select(
				"id, ref_id, amount, payment_date, payment_type, proof_url, notes, is_reversed, reversal_reason, bank:bank_accounts(bank_name, account_number)",
			)
			.eq("event_id", event.id)
			.order("payment_date", { ascending: false }),
		supabase
			.from("bank_accounts")
			.select("id, bank_name, account_number, account_holder")
			.eq("is_active", true)
			.order("is_default_receive", { ascending: false })
			.order("bank_name", { ascending: true }),
	]);

	const payments = (paymentsData ?? []).map((p) => ({
		...p,
		bank: Array.isArray(p.bank) ? p.bank[0] : p.bank,
	})) as PaymentRow[];

	const today = new Date().toISOString().slice(0, 10);
	const grand = Number(event.grand_total) || 0;
	const paid = Number(event.total_paid) || 0;
	const remaining = Number(event.remaining_balance) || 0;
	const status = event.payment_status as string;
	const paidPct = grand > 0 ? Math.min(100, Math.round((paid / grand) * 100)) : 0;
	const canLog = remaining > 0;

	return (
		<Container size="xl" className="space-y-6">
			{/* Header */}
			<div className="space-y-3">
				<Link
					href={`/operations/${event.project_id}`}
					className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ChevronLeft className="size-4" />
					<span className="font-mono text-xs">{event.project_id}</span>
				</Link>
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div className="space-y-1">
						<h1 className="text-fluid-h2 font-semibold tracking-tight">
							Payments
						</h1>
						<p className="text-sm text-muted-foreground">
							{event.client_name}
						</p>
					</div>
					<Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
						{PAYMENT_STATUS_LABELS[status] ?? status}
					</Badge>
				</div>
			</div>

			{/* Summary */}
			<section className="overflow-hidden rounded-xl border border-border-default bg-surface-2 shadow-[var(--shadow-level-1)]">
				<dl className="grid grid-cols-2 divide-x divide-y divide-border-default sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-3">
					<SummaryCell label="Grand Total">
						<MoneyAmount value={grand} size="lg" tone="default" />
					</SummaryCell>
					<SummaryCell label="Total Dibayar">
						<MoneyAmount
							value={paid}
							size="lg"
							tone={paid > 0 ? "positive" : "muted"}
						/>
					</SummaryCell>
					<SummaryCell label="Sisa Tagihan" className="max-sm:col-span-2">
						<MoneyAmount
							value={remaining}
							size="lg"
							tone={remaining > 0 ? "default" : "muted"}
						/>
					</SummaryCell>
				</dl>
				{/* Progress */}
				<div className="space-y-1.5 border-t border-border-default px-5 py-4">
					<div className="flex items-center justify-between text-xs">
						<span className="font-medium uppercase tracking-wider text-muted-foreground">
							Progress pembayaran
						</span>
						<span className="tabular font-medium text-foreground">
							{paidPct}%
						</span>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary transition-all"
							style={{ width: `${paidPct}%` }}
						/>
					</div>
				</div>
			</section>

			{/* Body */}
			<div
				className={
					canLog
						? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
						: "grid gap-6"
				}
			>
				<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5 shadow-[var(--shadow-level-1)]">
					<div className="flex items-baseline justify-between">
						<h2 className="text-base font-semibold tracking-tight">
							Riwayat Payment
						</h2>
						{payments.length > 0 && (
							<span className="tabular text-xs text-muted-foreground">
								{payments.length} transaksi
							</span>
						)}
					</div>
					<PaymentList projectId={event.project_id} payments={payments} />
				</section>

				{canLog && (
					<aside className="lg:sticky lg:top-6 lg:self-start">
						<section className="space-y-4 rounded-xl border border-border-default bg-surface-2 p-5 shadow-[var(--shadow-level-1)]">
							<div className="space-y-0.5">
								<h2 className="text-base font-semibold tracking-tight">
									Log payment baru
								</h2>
								<p className="text-xs text-muted-foreground">
									Total &amp; status event auto-update lewat trigger DB.
								</p>
							</div>
							<PaymentForm
								eventId={event.id as string}
								projectId={event.project_id}
								bankAccounts={(banks ?? []) as BankAccountOption[]}
								defaultDate={today}
								suggestedAmount={remaining}
							/>
						</section>
					</aside>
				)}
			</div>
		</Container>
	);
}

function SummaryCell({
	label,
	className = "",
	children,
}: {
	label: string;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={`space-y-1 px-5 py-4 ${className}`}>
			<dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</dt>
			<dd>{children}</dd>
		</div>
	);
}
