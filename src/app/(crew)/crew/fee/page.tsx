import { CheckCircle2, ChevronRight, Wallet } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/get-user";
import { formatDateID, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const ROLE_LABELS: Record<string, string> = {
	lead: "Lead",
	asisten: "Asisten",
	crew_c: "Crew C",
};

type AssignmentRow = {
	role_in_event: string;
	fee_amount: number;
	bonus_amount: number;
	is_paid: boolean;
	paid_at: string | null;
	paid_via_account: string | null;
	event:
		| {
				id: string;
				project_id: string;
				client_name: string;
				event_date: string;
		  }
		| Array<{
				id: string;
				project_id: string;
				client_name: string;
				event_date: string;
		  }>
		| null;
};

export default async function CrewFeePage() {
	const me = await getCurrentUser();
	if (!me) return null;

	const supabase = await createClient();

	const { data: assignments } = await supabase
		.from("crew_assignments")
		.select(
			`role_in_event, fee_amount, bonus_amount, is_paid, paid_at, paid_via_account,
			event:events!inner(id, project_id, client_name, event_date)`,
		)
		.eq("user_id", me.profile.id);

	const rows = ((assignments ?? []) as AssignmentRow[]).filter((a) => a.event);

	// Sort by event_date desc (most recent first)
	rows.sort((a, b) => {
		const ea = Array.isArray(a.event) ? a.event[0] : a.event;
		const eb = Array.isArray(b.event) ? b.event[0] : b.event;
		return (eb?.event_date ?? "").localeCompare(ea?.event_date ?? "");
	});

	const unpaid = rows.filter((r) => !r.is_paid);
	const paid = rows.filter((r) => r.is_paid);

	const totalUnpaid = unpaid.reduce(
		(s, r) => s + r.fee_amount + r.bonus_amount,
		0,
	);
	const totalPaid = paid.reduce(
		(s, r) => s + r.fee_amount + r.bonus_amount,
		0,
	);
	const totalAll = totalUnpaid + totalPaid;

	return (
		<div className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
			<header className="space-y-1">
				<h1 className="text-2xl font-semibold tracking-tight">Fee</h1>
				<p className="text-muted-foreground text-sm">
					Histori fee per event. Owner yang tandai paid setelah transfer.
				</p>
			</header>

			<dl className="grid grid-cols-3 gap-2">
				<SummaryStat
					label="Outstanding"
					value={totalUnpaid}
					tone={totalUnpaid > 0 ? "amber" : "muted"}
				/>
				<SummaryStat label="Paid" value={totalPaid} tone="emerald" />
				<SummaryStat label="Total" value={totalAll} tone="primary" />
			</dl>

			{rows.length === 0 ? (
				<div className="border-border bg-card flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
					<Wallet className="text-muted-foreground h-8 w-8" />
					<p className="text-muted-foreground text-sm">
						Belum ada fee tercatat.
					</p>
				</div>
			) : (
				<>
					{unpaid.length > 0 && (
						<section className="space-y-2">
							<h2 className="text-amber-700 dark:text-amber-400 text-xs font-semibold uppercase tracking-wider">
								Outstanding ({unpaid.length})
							</h2>
							<div className="space-y-2">
								{unpaid.map((r, i) => (
									<FeeRow key={`u-${i}`} row={r} />
								))}
							</div>
						</section>
					)}

					{paid.length > 0 && (
						<section className="space-y-2">
							<h2 className="text-emerald-700 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider">
								Paid ({paid.length})
							</h2>
							<div className="space-y-2">
								{paid.map((r, i) => (
									<FeeRow key={`p-${i}`} row={r} />
								))}
							</div>
						</section>
					)}
				</>
			)}
		</div>
	);
}

function FeeRow({ row }: { row: AssignmentRow }) {
	const ev = Array.isArray(row.event) ? row.event[0] : row.event;
	if (!ev) return null;
	const total = row.fee_amount + row.bonus_amount;
	return (
		<Link
			href={`/crew/jadwal/${ev.project_id}`}
			className="border-border bg-card hover:border-foreground/20 flex items-stretch gap-3 rounded-xl border p-3 transition-colors active:scale-[0.99]"
		>
			<div className="min-w-0 flex-1 space-y-1">
				<p className="text-foreground truncate text-sm font-medium">
					{ev.client_name}
				</p>
				<p className="text-muted-foreground tabular text-xs">
					{formatDateID(ev.event_date)} ·{" "}
					{ROLE_LABELS[row.role_in_event] ?? row.role_in_event}
				</p>
				{row.bonus_amount > 0 && (
					<p className="text-muted-foreground tabular text-[11px]">
						base {formatRupiah(row.fee_amount)} + bonus{" "}
						{formatRupiah(row.bonus_amount)}
					</p>
				)}
				{row.is_paid && row.paid_at && (
					<p className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 text-[11px]">
						<CheckCircle2 className="h-3 w-3" />
						paid {formatDateID(row.paid_at.slice(0, 10))}
						{row.paid_via_account && ` · ${row.paid_via_account}`}
					</p>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<div className="text-right">
					<p
						className={`tabular text-base font-semibold ${
							row.is_paid
								? "text-emerald-600 dark:text-emerald-400"
								: "text-amber-600 dark:text-amber-400"
						}`}
					>
						{formatRupiah(total)}
					</p>
					<p className="text-muted-foreground text-[10px] uppercase tracking-wider">
						{row.is_paid ? "paid" : "unpaid"}
					</p>
				</div>
				<ChevronRight className="text-muted-foreground/60 h-4 w-4" />
			</div>
		</Link>
	);
}

function SummaryStat({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone: "primary" | "emerald" | "amber" | "muted";
}) {
	const cls =
		tone === "primary"
			? "text-primary"
			: tone === "emerald"
				? "text-emerald-600 dark:text-emerald-400"
				: tone === "amber"
					? "text-amber-600 dark:text-amber-400"
					: "text-muted-foreground";
	return (
		<div className="border-border bg-card space-y-0.5 rounded-xl border p-3 text-center">
			<dt className="text-muted-foreground text-[10px] uppercase tracking-wider">
				{label}
			</dt>
			<dd className={`tabular text-sm font-semibold ${cls}`}>
				{formatRupiah(value)}
			</dd>
		</div>
	);
}
