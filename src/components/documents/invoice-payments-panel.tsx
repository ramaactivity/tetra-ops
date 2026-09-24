import { LogPaymentDialog } from "@/components/billing/log-payment-dialog";
import type { BankAccountOption } from "@/components/billing/payment-form";
import {
	PaymentList,
	type PaymentRow,
} from "@/components/billing/payment-list";
import { formatRupiah, PAYMENT_STATUS_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PaidDocButtons } from "./paid-doc-buttons";

const STATUS_DOT: Record<string, string> = {
	paid: "bg-emerald-500",
	overpaid: "bg-emerald-500",
	partial: "bg-sky-500",
	dp: "bg-sky-500",
	overdue: "bg-rose-500",
	unpaid: "bg-border-strong",
};

/**
 * Panel pembayaran di editor invoice. Sumber datanya event + payments (sama
 * dengan halaman Billing/Payments) — "Catat pembayaran" memakai dialog yang
 * sama, jadi kas, jurnal, dan Telegram tetap jalan lewat satu jalur.
 */
export async function InvoicePaymentsPanel({ eventId }: { eventId: string }) {
	const supabase = await createClient();
	const { data: event } = await supabase
		.from("events")
		.select(
			"id, project_id, client_name, grand_total, total_paid, remaining_balance, payment_status, vendor_commission_mode, vendor_commission_amount",
		)
		.eq("id", eventId)
		.maybeSingle();
	if (!event) return null;

	const [
		{ data: paymentsData },
		{ data: banks },
		{ data: dpCfg },
		{ data: paymentJEs },
	] = await Promise.all([
		supabase
			.from("payments")
			.select(
				"id, ref_id, amount, payment_date, payment_type, proof_url, notes, is_reversed, reversal_reason, bank:bank_accounts(bank_name, account_number)",
			)
			.eq("event_id", event.id)
			.order("payment_date", { ascending: false }),
		supabase
			.from("bank_accounts")
			.select(
				"id, bank_name, account_number, account_holder, is_default_receive",
			)
			.eq("is_active", true)
			.neq("account_kind", "emoney")
			.order("is_default_receive", { ascending: false })
			.order("bank_name", { ascending: true }),
		supabase
			.from("system_config")
			.select("value")
			.eq("key", "default_dp_amount")
			.maybeSingle(),
		supabase
			.from("journal_entries")
			.select("ref_id, source_id")
			.eq("source_event_id", event.id)
			.eq("source_type", "payment"),
	]);

	const journalRefByPayment = new Map(
		(paymentJEs ?? [])
			.filter((j) => j.source_id)
			.map((j) => [j.source_id as string, j.ref_id as string]),
	);
	const payments = (paymentsData ?? []).map((p) => ({
		...p,
		bank: Array.isArray(p.bank) ? p.bank[0] : p.bank,
		journal_ref: journalRefByPayment.get(p.id as string) ?? null,
	})) as PaymentRow[];

	const grand = Number(event.grand_total) || 0;
	const cut =
		event.vendor_commission_mode === "upfront_cut"
			? Number(event.vendor_commission_amount) || 0
			: 0;
	const billable = Math.max(0, grand - cut);
	const paid = Number(event.total_paid) || 0;
	const remaining = Number(event.remaining_balance) || 0;
	const status = event.payment_status as string;
	const isPaid = remaining <= 0 && paid > 0;
	const pct =
		billable > 0 ? Math.min(100, Math.round((paid / billable) * 100)) : 0;
	const today = new Date().toISOString().slice(0, 10);
	const defaultDp =
		typeof dpCfg?.value === "number" && dpCfg.value > 0
			? dpCfg.value
			: undefined;

	return (
		<section className="space-y-3 rounded-2xl border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)]">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<h2 className="text-[15px] font-semibold tracking-[-0.01em]">
						Pembayaran
					</h2>
					<span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[12px] font-medium">
						<span
							className={cn(
								"size-1.5 rounded-full",
								STATUS_DOT[status] ?? "bg-border-strong",
							)}
						/>
						{PAYMENT_STATUS_LABELS[status] ?? status}
					</span>
				</div>
				{remaining > 0 ? (
					<LogPaymentDialog
						eventId={event.id as string}
						projectId={event.project_id as string}
						bankAccounts={(banks ?? []) as BankAccountOption[]}
						defaultDate={today}
						suggestedAmount={remaining}
						grandTotal={billable}
						totalPaid={paid}
						defaultDpAmount={defaultDp}
					/>
				) : null}
			</div>

			{/* Ringkasan satu strip: terbayar / tagihan + progres, sisa di kanan */}
			<div className="space-y-1.5">
				<div className="flex items-baseline justify-between gap-3 text-[13px]">
					<span className="text-muted-foreground">
						<span className="tabular font-semibold text-foreground">
							{formatRupiah(paid)}
						</span>{" "}
						dari <span className="tabular">{formatRupiah(billable)}</span>
					</span>
					<span
						className={cn(
							"tabular font-semibold",
							remaining > 0 ? "text-rose-700" : "text-emerald-700",
						)}
					>
						{remaining > 0 ? `Sisa ${formatRupiah(remaining)}` : "Lunas"}
					</span>
				</div>
				<div className="h-1.5 overflow-hidden rounded-full bg-secondary">
					<div
						className="h-full rounded-full bg-emerald-500 transition-[width]"
						style={{ width: `${pct}%` }}
					/>
				</div>
			</div>

			<PaymentList
				projectId={event.project_id as string}
				payments={payments}
				compact
			/>

			<div className="border-t border-border-subtle pt-2.5">
				<PaidDocButtons eventId={event.id as string} isPaid={isPaid} />
			</div>
		</section>
	);
}
