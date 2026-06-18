import {
	ArrowDownToLine,
	ArrowUpFromLine,
	ChevronLeft,
	History,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	type BankOption,
	ManualMovementForm,
} from "@/components/sinking-funds/movement-form";
import { EmptyState } from "@/components/ui/empty-state";
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

type MovementRow = {
	id: string;
	movement_type: "deposit" | "withdrawal";
	amount: number;
	source_type: string | null;
	source_event_id: string | null;
	description: string;
	created_at: string;
	performed_by_user: { full_name: string } | null;
};

const SOURCE_LABELS: Record<string, string> = {
	settlement: "Settlement",
	manual: "Manual",
	transfer: "Transfer",
};

export default async function SinkingFundMovementsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();

	const { data: fund } = await supabase
		.from("sinking_funds")
		.select("id, code, name, target_balance")
		.eq("id", id)
		.maybeSingle();

	if (!fund) notFound();

	const [{ data: movementsData }, { data: banksData }] = await Promise.all([
		supabase
			.from("sinking_fund_movements")
			.select(
				`
				id, movement_type, amount, source_type, source_event_id,
				description, created_at,
				performed_by_user:users!sinking_fund_movements_performed_by_fkey(full_name)
			`,
			)
			.eq("fund_id", id)
			.order("created_at", { ascending: false })
			.limit(100),
		supabase
			.from("bank_accounts")
			.select("id, bank_name, account_number, account_holder")
			.eq("is_active", true)
			.order("is_default_receive", { ascending: false })
			.order("bank_name", { ascending: true }),
	]);

	const movements = (movementsData ?? []).map((m) => ({
		...m,
		performed_by_user: Array.isArray(m.performed_by_user)
			? m.performed_by_user[0]
			: m.performed_by_user,
	})) as MovementRow[];

	const banks = (banksData ?? []) as BankOption[];

	const balance = movements.reduce(
		(s, m) => s + (m.movement_type === "deposit" ? m.amount : -m.amount),
		0,
	);
	const totalIn = movements
		.filter((m) => m.movement_type === "deposit")
		.reduce((s, m) => s + m.amount, 0);
	const totalOut = movements
		.filter((m) => m.movement_type === "withdrawal")
		.reduce((s, m) => s + m.amount, 0);

	return (
		<Container size="lg" className="space-y-3">
			<div className="space-y-2">
				<Link
					href="/finance/sinking-funds"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
				>
					<ChevronLeft className="h-4 w-4" />
					Dana Cadangan
				</Link>
				<SectionHeader
					as="h1"
					title={fund.name}
					description={<span className="tabular">{fund.code}</span>}
				/>
			</div>

			<div className="border-border-default bg-card grid gap-4 rounded-lg border p-5 sm:grid-cols-3">
				<Stat label="Saldo" value={formatRupiah(balance)} accent="primary" />
				<Stat
					label="Total Deposit"
					value={formatRupiah(totalIn)}
					accent="emerald"
				/>
				<Stat
					label="Total Withdrawal"
					value={formatRupiah(totalOut)}
					accent="rose"
				/>
			</div>

			<div className="border-border-default bg-card space-y-4 rounded-lg border p-5">
				<div>
					<h3 className="text-base font-semibold">Tambah movement manual</h3>
					<p className="text-muted-foreground text-xs">
						Untuk koreksi atau setor/tarik di luar settlement.
					</p>
				</div>
				<ManualMovementForm
					fundId={fund.id}
					fundName={fund.name}
					bankAccounts={banks}
				/>
			</div>

			<div className="border-border-default bg-card space-y-3 rounded-lg border p-5">
				<h3 className="text-base font-semibold">
					Riwayat movement{" "}
					<span className="text-muted-foreground text-xs font-normal">
						({movements.length})
					</span>
				</h3>
				{movements.length === 0 ? (
					<EmptyState
						icon={History}
						title="Belum ada movement"
						description="Catat movement pertama lewat form di atas."
						size="sm"
					/>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Tanggal</TableHead>
									<TableHead>Tipe</TableHead>
									<TableHead className="text-right">Jumlah</TableHead>
									<TableHead>Sumber</TableHead>
									<TableHead>Deskripsi</TableHead>
									<TableHead>Oleh</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{movements.map((m) => (
									<TableRow key={m.id}>
										<TableCell className="text-muted-foreground tabular text-sm">
											{formatDateID(m.created_at)}
										</TableCell>
										<TableCell>
											{m.movement_type === "deposit" ? (
												<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 text-sm font-medium">
													<ArrowDownToLine className="h-3.5 w-3.5" />
													Deposit
												</span>
											) : (
												<span className="text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 text-sm font-medium">
													<ArrowUpFromLine className="h-3.5 w-3.5" />
													Withdrawal
												</span>
											)}
										</TableCell>
										<TableCell
											className={`tabular text-right font-medium ${
												m.movement_type === "deposit"
													? "text-emerald-600 dark:text-emerald-400"
													: "text-rose-600 dark:text-rose-400"
											}`}
										>
											{m.movement_type === "deposit" ? "+" : "−"}
											{formatRupiah(m.amount)}
										</TableCell>
										<TableCell className="text-muted-foreground text-xs">
											{m.source_type
												? (SOURCE_LABELS[m.source_type] ?? m.source_type)
												: "—"}
										</TableCell>
										<TableCell className="text-sm">{m.description}</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{m.performed_by_user?.full_name ?? "—"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</div>
		</Container>
	);
}

function Stat({
	label,
	value,
	accent,
}: {
	label: string;
	value: string;
	accent: "primary" | "emerald" | "rose";
}) {
	const cls =
		accent === "primary"
			? "text-foreground"
			: accent === "emerald"
				? "text-emerald-500"
				: "text-rose-500";
	return (
		<div className="space-y-0.5">
			<dt className="text-muted-foreground text-xs uppercase tracking-wider">
				{label}
			</dt>
			<dd className={`tabular text-lg font-semibold ${cls}`}>{value}</dd>
		</div>
	);
}
