import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogPaymentDialog } from "@/components/billing/log-payment-dialog";
import type { BankAccountOption } from "@/components/billing/payment-form";
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
	const paidPct =
		grand > 0 ? Math.min(100, Math.round((paid / grand) * 100)) : 0;
	const canLog = remaining > 0;

	return (
		<Container size="xl" className="space-y-4 pb-4">
			{/* Header — compact */}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<Link
						href={`/operations/${event.project_id}`}
						className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
					>
						<ChevronLeft className="size-3.5" />
						<span className="eyebrow">{event.project_id}</span>
					</Link>
					<div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
						<h1 className="type-title">Payments</h1>
						<span className="type-secondary">{event.client_name}</span>
						<Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
							{PAYMENT_STATUS_LABELS[status] ?? status}
						</Badge>
					</div>
				</div>
				{canLog && (
					<LogPaymentDialog
						eventId={event.id as string}
						projectId={event.project_id}
						bankAccounts={(banks ?? []) as BankAccountOption[]}
						defaultDate={today}
						suggestedAmount={remaining}
						grandTotal={grand}
						totalPaid={paid}
					/>
				)}
			</div>

			{/* Summary — stat row + progress */}
			<section className="overflow-hidden rounded-2xl border border-border-default bg-card shadow-[var(--shadow-level-2)]">
				<dl className="grid grid-cols-3 divide-x divide-border-subtle">
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
					<SummaryCell label="Sisa Tagihan">
						<MoneyAmount
							value={remaining}
							size="lg"
							tone={remaining > 0 ? "default" : "muted"}
						/>
					</SummaryCell>
				</dl>
				<div className="flex items-center gap-3 border-t border-border-subtle px-5 py-2.5">
					<span className="eyebrow shrink-0">Progress</span>
					<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary transition-all"
							style={{ width: `${paidPct}%` }}
						/>
					</div>
					<span className="type-num shrink-0 text-[0.8125rem]">{paidPct}%</span>
				</div>
			</section>

			{/* Riwayat — full width; form lives in the Log payment modal */}
			<section className="rounded-2xl border border-border-default bg-card p-4 shadow-[var(--shadow-level-2)] sm:p-5">
				<div className="mb-3 flex items-baseline justify-between">
					<h2 className="type-heading">Riwayat payment</h2>
					{payments.length > 0 && (
						<span className="type-caption tabular">
							{payments.length} transaksi
						</span>
					)}
				</div>
				<PaymentList projectId={event.project_id} payments={payments} />
			</section>
		</Container>
	);
}

function SummaryCell({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="min-w-0 px-4 py-2.5 sm:px-5">
			<dt className="eyebrow">{label}</dt>
			<dd className="mt-0.5 truncate">{children}</dd>
		</div>
	);
}
