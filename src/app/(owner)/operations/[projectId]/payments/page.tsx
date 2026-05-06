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
import { formatRupiah, PAYMENT_STATUS_LABELS } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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
	const remaining = event.remaining_balance as number;

	return (
		<div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-2">
				<Link
					href={`/operations/${event.project_id}`}
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					{event.project_id}
				</Link>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
					<p className="text-muted-foreground text-sm">{event.client_name}</p>
				</div>
			</div>

			<div className="border-border bg-card grid gap-4 rounded-xl border p-5 sm:grid-cols-4">
				<Stat
					label="Grand Total"
					value={formatRupiah(event.grand_total ?? 0)}
				/>
				<Stat
					label="Total Paid"
					value={formatRupiah(event.total_paid ?? 0)}
					accent="emerald"
				/>
				<Stat
					label="Remaining"
					value={formatRupiah(remaining)}
					accent={remaining > 0 ? "primary" : "muted"}
				/>
				<Stat
					label="Status"
					value={
						PAYMENT_STATUS_LABELS[event.payment_status as string] ??
						(event.payment_status as string)
					}
				/>
			</div>

			<div className="border-border bg-card space-y-4 rounded-xl border p-5">
				<h2 className="text-base font-semibold">Riwayat Payment</h2>
				<PaymentList projectId={event.project_id} payments={payments} />
			</div>

			{remaining > 0 && (
				<div className="border-border bg-card space-y-4 rounded-xl border p-5">
					<div>
						<h2 className="text-base font-semibold">Log payment baru</h2>
						<p className="text-muted-foreground text-xs">
							Total + status event auto-update lewat trigger DB.
						</p>
					</div>
					<PaymentForm
						eventId={event.id as string}
						projectId={event.project_id}
						bankAccounts={(banks ?? []) as BankAccountOption[]}
						defaultDate={today}
						suggestedAmount={remaining}
					/>
				</div>
			)}
		</div>
	);
}

function Stat({
	label,
	value,
	accent,
}: {
	label: string;
	value: string;
	accent?: "primary" | "emerald" | "muted";
}) {
	const accentClass =
		accent === "primary"
			? "text-primary"
			: accent === "emerald"
				? "text-emerald-500"
				: accent === "muted"
					? "text-muted-foreground"
					: "text-foreground";
	return (
		<div className="space-y-0.5">
			<dt className="text-muted-foreground text-xs uppercase tracking-wider">
				{label}
			</dt>
			<dd className={`tabular text-sm font-semibold ${accentClass}`}>
				{value}
			</dd>
		</div>
	);
}
