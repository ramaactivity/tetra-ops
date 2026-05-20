import {
	AlertTriangle,
	CheckCircle2,
	ClipboardList,
	Wallet2,
} from "lucide-react";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { KpiRow } from "@/components/operations/_shared/kpi-row";
import { PageHeader } from "@/components/operations/_shared/page-header";
import { KpiCard } from "@/components/operations/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	type CashAccountOption,
	PayablesTable,
	type PayableRow,
} from "@/components/finance/payables/payables-table";
import {
	type PayablesStatusFilter,
	PayablesStatusTabs,
} from "@/components/finance/payables/payables-status-tabs";
import { getCurrentUser } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";

const VALID_FILTERS: PayablesStatusFilter[] = [
	"outstanding",
	"open",
	"partial",
	"paid",
	"cancelled",
	"all",
];

export default async function PayablesPage({
	searchParams,
}: {
	searchParams: Promise<{ filter?: string }>;
}) {
	const me = await getCurrentUser();
	if (!me) redirect("/login");
	if (me.profile.role !== "super_admin" && me.profile.role !== "owner") {
		redirect("/finance");
	}

	const { filter: filterRaw } = await searchParams;
	const filter = (
		VALID_FILTERS.includes(filterRaw as PayablesStatusFilter)
			? filterRaw
			: "outstanding"
	) as PayablesStatusFilter;

	const supabase = await createClient();

	// Always fetch all for KPIs
	const { data: allPayables } = await supabase
		.from("payables")
		.select(
			`id, supplier_id, invoice_no, description, amount, amount_paid,
			 issued_date, due_date, payment_terms, status, notes, paid_at,
			 cancelled_at, cancelled_reason, source_journal_id, created_at,
			 supplier:suppliers!payables_supplier_id_fkey(name, contact),
			 payments:payable_payments(id, amount, payment_date, payment_account_code,
				 notes, paid_by_user:users!payable_payments_paid_by_fkey(full_name))`,
		)
		.order("issued_date", { ascending: false });

	type RawPay = {
		id: string;
		supplier_id: string | null;
		invoice_no: string | null;
		description: string | null;
		amount: number | string;
		amount_paid: number | string;
		issued_date: string;
		due_date: string | null;
		payment_terms: string | null;
		status: string;
		notes: string | null;
		paid_at: string | null;
		cancelled_at: string | null;
		cancelled_reason: string | null;
		source_journal_id: string | null;
		created_at: string;
		supplier:
			| { name: string; contact: string | null }
			| { name: string; contact: string | null }[]
			| null;
		payments: Array<{
			id: string;
			amount: number | string;
			payment_date: string;
			payment_account_code: string;
			notes: string | null;
			paid_by_user:
				| { full_name: string | null }
				| { full_name: string | null }[]
				| null;
		}>;
	};

	const allRows: PayableRow[] = ((allPayables ?? []) as RawPay[]).map((p) => {
		const sup = Array.isArray(p.supplier) ? p.supplier[0] : p.supplier;
		const payments = (p.payments ?? []).map((py) => {
			const u = Array.isArray(py.paid_by_user)
				? py.paid_by_user[0]
				: py.paid_by_user;
			return {
				id: py.id,
				amount: Number(py.amount),
				payment_date: py.payment_date,
				payment_account_code: py.payment_account_code,
				notes: py.notes,
				paid_by_name: u?.full_name ?? null,
			};
		});
		const amount = Number(p.amount);
		const amountPaid = Number(p.amount_paid);
		return {
			id: p.id,
			supplier_id: p.supplier_id,
			supplier_name: sup?.name ?? null,
			supplier_contact: sup?.contact ?? null,
			invoice_no: p.invoice_no,
			description: p.description,
			amount,
			amount_paid: amountPaid,
			remaining: Math.max(0, amount - amountPaid),
			issued_date: p.issued_date,
			due_date: p.due_date,
			payment_terms: p.payment_terms,
			status: p.status,
			notes: p.notes,
			paid_at: p.paid_at,
			cancelled_at: p.cancelled_at,
			cancelled_reason: p.cancelled_reason,
			source_journal_id: p.source_journal_id,
			created_at: p.created_at,
			payments,
		};
	});

	// KPIs computed across all (not filtered)
	const todayMs = new Date().setHours(0, 0, 0, 0);
	const outstanding = allRows.filter(
		(r) => r.status === "open" || r.status === "partial",
	);
	const overdue = outstanding.filter(
		(r) => r.due_date && new Date(r.due_date).getTime() < todayMs,
	);
	const totalOutstanding = outstanding.reduce((s, r) => s + r.remaining, 0);
	const totalOverdue = overdue.reduce((s, r) => s + r.remaining, 0);
	const totalPaidMtd = allRows.reduce((s, r) => {
		// Sum payments this month
		const now = new Date();
		const monthPay = r.payments
			.filter((p) => {
				const d = new Date(p.payment_date);
				return (
					d.getMonth() === now.getMonth() &&
					d.getFullYear() === now.getFullYear()
				);
			})
			.reduce((ss, p) => ss + p.amount, 0);
		return s + monthPay;
	}, 0);

	const counts: Record<PayablesStatusFilter, number> = {
		outstanding: outstanding.length,
		open: allRows.filter((r) => r.status === "open").length,
		partial: allRows.filter((r) => r.status === "partial").length,
		paid: allRows.filter((r) => r.status === "paid").length,
		cancelled: allRows.filter((r) => r.status === "cancelled").length,
		all: allRows.length,
	};

	const filteredRows =
		filter === "outstanding"
			? outstanding
			: filter === "all"
				? allRows
				: allRows.filter((r) => r.status === filter);

	// Cash accounts for payment dialog
	const { data: cashAccounts } = await supabase
		.from("chart_of_accounts")
		.select("code, name")
		.eq("account_type", "asset")
		.eq("is_active", true)
		.in("code", ["1-100", "1-110", "1-111", "1-112"])
		.order("code");
	const cashAccountOptions: CashAccountOption[] =
		(cashAccounts ?? []) as CashAccountOption[];

	return (
		<Container size="xl" className="space-y-6">
			<PageHeader
				title="Hutang Dagang"
				backHref="/finance"
				backLabel="Finance"
				description="Outstanding TOP purchases per supplier. Klik Bayar untuk record pembayaran — auto-jurnal Hutang Vendor turun, Kas/Bank turun."
			/>

			<KpiRow className="lg:grid-cols-4">
				<KpiCard
					label="Outstanding"
					value={`Rp ${totalOutstanding.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
					hint={`${outstanding.length} invoice belum lunas`}
					icon={Wallet2}
					accent={totalOutstanding > 0 ? "amber" : "default"}
				/>
				<KpiCard
					label="Overdue"
					value={`Rp ${totalOverdue.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
					hint={`${overdue.length} invoice lewat jatuh tempo`}
					icon={AlertTriangle}
					accent={totalOverdue > 0 ? "rose" : "default"}
				/>
				<KpiCard
					label="Dibayar Bulan Ini"
					value={`Rp ${totalPaidMtd.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
					hint="total pembayaran bulan berjalan"
					icon={CheckCircle2}
					accent="emerald"
				/>
				<KpiCard
					label="Total Lifetime"
					value={allRows.length.toLocaleString("id-ID")}
					hint={`${counts.paid} lunas · ${counts.cancelled} cancelled`}
					icon={ClipboardList}
				/>
			</KpiRow>

			<PayablesStatusTabs current={filter} counts={counts} />

			{filteredRows.length === 0 ? (
				<EmptyState
					icon={ClipboardList}
					title={
						filter === "outstanding"
							? "Tidak ada hutang outstanding"
							: filter === "paid"
								? "Belum ada yang lunas"
								: filter === "cancelled"
									? "Tidak ada yang dibatalkan"
									: "Belum ada hutang dagang"
					}
					description="Pembelian dengan payment_method TOP otomatis tercatat di sini. Cash purchases ga masuk ke list ini."
				/>
			) : (
				<PayablesTable
					rows={filteredRows}
					cashAccounts={cashAccountOptions}
				/>
			)}
		</Container>
	);
}
