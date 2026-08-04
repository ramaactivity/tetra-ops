import { notFound } from "next/navigation";
import { LogPaymentDialog } from "@/components/billing/log-payment-dialog";
import type { BankAccountOption } from "@/components/billing/payment-form";
import {
	PaymentList,
	type PaymentRow,
} from "@/components/billing/payment-list";
import { Container } from "@/components/layout/container";
import { TopbarEntityPortal } from "@/components/layouts/topbar-entity-portal";
import { MoneyAmount } from "@/components/ui/money-amount";
import { formatRupiah, PAYMENT_STATUS_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// Light status dots that read on the emerald hero.
const HERO_PAY_DOT: Record<string, string> = {
	paid: "bg-emerald-200",
	overpaid: "bg-emerald-200",
	dp: "bg-sky-300",
	partial: "bg-sky-300",
	overdue: "bg-rose-300",
	unpaid: "bg-white/60",
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
			"id, project_id, client_name, grand_total, total_paid, remaining_balance, payment_status, due_date, vendor_commission_mode, vendor_commission_amount",
		)
		.eq("project_id", projectId)
		.maybeSingle();
	if (!event) notFound();

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
			.select("id, bank_name, account_number, account_holder")
			.eq("is_active", true)
			.order("is_default_receive", { ascending: false })
			.order("bank_name", { ascending: true }),
		// Nominal DP standar Tetra — dibaca dari setting, bukan ditanam di
		// komponen, supaya kebijakannya punya satu sumber kebenaran.
		supabase
			.from("system_config")
			.select("value")
			.eq("key", "default_dp_amount")
			.maybeSingle(),
		// Jurnal per pembayaran, untuk tombol "Lihat di jurnal". Difilter
		// lewat source_event_id (sudah diketahui) alih-alih daftar id
		// payment, jadi tetap muat di batch paralel yang sama.
		supabase
			.from("journal_entries")
			.select("ref_id, source_id")
			.eq("source_event_id", event.id)
			.eq("source_type", "payment"),
	]);

	const defaultDpAmount =
		typeof dpCfg?.value === "number" && dpCfg.value > 0
			? dpCfg.value
			: undefined;

	// payment.id → ref jurnalnya. Pembayaran pre-cutoff (dicatat sebelum mesin
	// jurnal ada, atau koreksi manual yang uangnya sudah masuk saldo awal)
	// memang tidak punya entry — nilainya null dan tombolnya tidak dirender.
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

	const today = new Date().toISOString().slice(0, 10);
	const grand = Number(event.grand_total) || 0;
	// Potongan langsung vendor (upfront_cut) dipotong di muka dari payment
	// flow — target pelunasan = grand_total − potongan ("Tetra terima").
	const vendorCut =
		event.vendor_commission_mode === "upfront_cut"
			? Number(event.vendor_commission_amount) || 0
			: 0;
	const billable = Math.max(0, grand - vendorCut);
	const paid = Number(event.total_paid) || 0;
	const remaining = Number(event.remaining_balance) || 0;
	const status = event.payment_status as string;
	const paidPct =
		billable > 0 ? Math.min(100, Math.round((paid / billable) * 100)) : 0;
	const canLog = remaining > 0;

	return (
		<Container size="xl" className="space-y-3 pb-4">
			<TopbarEntityPortal name={event.client_name} />
			{/* Emerald hero — mirrors the event-detail hero */}
			<section className="overflow-hidden rounded-[20px] bg-[#059669] p-5 text-white shadow-[var(--shadow-level-3)]">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
							Pembayaran
						</p>
						<h1 className="mt-2 break-words text-[26px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[32px]">
							{event.client_name}
						</h1>
					</div>
					<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur-sm">
						<span
							className={cn(
								"size-1.5 rounded-full",
								HERO_PAY_DOT[status] ?? "bg-white",
							)}
							aria-hidden
						/>
						{PAYMENT_STATUS_LABELS[status] ?? status}
					</span>
				</div>
			</section>

			{/* Summary — stat row + 2-segment progress (matches dashboard targets) */}
			<section className="overflow-hidden rounded-[16px] border border-border-subtle bg-card shadow-[var(--shadow-level-2)]">
				<dl className="grid grid-cols-1 divide-y divide-border-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
					<SummaryCell label={vendorCut > 0 ? "Tetra Terima" : "Grand Total"}>
						<MoneyAmount value={billable} size="lg" tone="default" />
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
				{vendorCut > 0 && (
					<p className="border-t border-border-subtle px-5 py-2.5 text-[11.5px] leading-snug text-muted-foreground">
						Grand total <span className="tabular">{formatRupiah(grand)}</span> −
						potongan vendor{" "}
						<span className="tabular">{formatRupiah(vendorCut)}</span> (dipotong
						di muka dari payment flow) — yang ditunggu masuk ke Tetra{" "}
						<span className="tabular font-medium text-foreground">
							{formatRupiah(billable)}
						</span>
						.
					</p>
				)}
				<div className="border-t border-border-subtle px-5 py-3.5">
					<div className="flex items-center justify-between text-[12.5px] leading-none">
						<span className="text-muted-foreground">Progress pembayaran</span>
						<span
							className={cn(
								"tabular font-semibold",
								paidPct >= 100
									? "text-emerald-700 dark:text-emerald-400"
									: "text-amber-700 dark:text-amber-500",
							)}
						>
							{paidPct}%
						</span>
					</div>
					<div className="mt-2 flex h-[14px] w-full items-stretch gap-1.5">
						{paidPct > 0 ? (
							<div
								className="rounded-[6px]"
								style={{ width: `${paidPct}%`, backgroundColor: "#74c02f" }}
							/>
						) : null}
						{paidPct < 100 ? (
							<div className="flex-1 rounded-[6px] bg-[repeating-linear-gradient(45deg,#dedcd4_0,#dedcd4_4px,#f1f0eb_4px,#f1f0eb_9px)]" />
						) : null}
					</div>
				</div>
			</section>

			{/* Riwayat — full width; form lives in the Log payment modal */}
			<section className="rounded-[16px] border border-border-subtle bg-card p-4 shadow-[var(--shadow-level-2)] sm:p-5">
				<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-baseline gap-2">
						<h2 className="type-heading">Riwayat payment</h2>
						{payments.length > 0 && (
							<span className="type-caption tabular">
								{payments.length} transaksi
							</span>
						)}
					</div>
					{canLog && (
						<LogPaymentDialog
							eventId={event.id as string}
							projectId={event.project_id}
							bankAccounts={(banks ?? []) as BankAccountOption[]}
							defaultDate={today}
							suggestedAmount={remaining}
							grandTotal={billable}
							totalPaid={paid}
							defaultDpAmount={defaultDpAmount}
						/>
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
		<div className="flex min-w-0 items-center justify-between gap-3 px-5 py-3 sm:flex-col sm:items-start sm:gap-0 sm:py-3">
			<dt className="eyebrow shrink-0">{label}</dt>
			<dd className="min-w-0 text-right sm:mt-1 sm:text-left">{children}</dd>
		</div>
	);
}
