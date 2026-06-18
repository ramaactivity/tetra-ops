import { CheckCircle2, PiggyBank, Plus, Target, Wallet } from "lucide-react";
import Link from "next/link";
import { type StatItem, StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import {
	type FundRow,
	SinkingFundsExplorer,
} from "@/components/sinking-funds/sinking-funds-explorer";
import { buttonVariants } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type RawFund = {
	id: string;
	code: string;
	name: string;
	description: string | null;
	allocation_type: "percentage" | "flat";
	allocation_value: number | string;
	target_balance: number | null;
	is_active: boolean;
	display_order: number;
};

type MovementAgg = {
	fund_id: string;
	movement_type: "deposit" | "withdrawal";
	amount: number;
};

export default async function SinkingFundsListPage() {
	const supabase = await createClient();

	const [{ data: fundsData, error }, { data: movementsData }] =
		await Promise.all([
			supabase
				.from("sinking_funds")
				.select(
					"id, code, name, description, allocation_type, allocation_value, target_balance, is_active, display_order",
				)
				.order("display_order", { ascending: true })
				.order("name", { ascending: true }),
			supabase
				.from("sinking_fund_movements")
				.select("fund_id, movement_type, amount"),
		]);

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat sinking funds: {error.message}
				</p>
			</div>
		);
	}

	const rawFunds = (fundsData ?? []) as RawFund[];
	const movements = (movementsData ?? []) as MovementAgg[];

	const balanceById = new Map<string, number>();
	for (const m of movements) {
		const prev = balanceById.get(m.fund_id) ?? 0;
		const delta = m.movement_type === "deposit" ? m.amount : -m.amount;
		balanceById.set(m.fund_id, prev + delta);
	}

	const funds: FundRow[] = rawFunds.map((f) => ({
		id: f.id,
		code: f.code,
		name: f.name,
		description: f.description,
		allocation_type: f.allocation_type,
		allocation_value: Number(f.allocation_value),
		target_balance: f.target_balance,
		balance: balanceById.get(f.id) ?? 0,
		is_active: f.is_active,
	}));

	const activeCount = funds.filter((f) => f.is_active).length;
	const totalBalance = funds.reduce((s, f) => s + f.balance, 0);
	const totalTarget = funds.reduce((s, f) => s + (f.target_balance ?? 0), 0);
	const overallPct =
		totalTarget > 0
			? Math.min(100, Math.round((totalBalance / totalTarget) * 100))
			: null;

	const stats: StatItem[] = [
		{
			label: "Total Fund",
			value: String(funds.length),
			hint: "dana cadangan",
			icon: PiggyBank,
		},
		{
			label: "Aktif",
			value: String(activeCount),
			hint: `${funds.length - activeCount} nonaktif`,
			icon: CheckCircle2,
			accent: "emerald",
		},
		{
			label: "Total Saldo",
			value: formatRupiah(totalBalance),
			hint: "terkumpul",
			icon: Wallet,
		},
		{
			label: "Progress Target",
			value: overallPct !== null ? `${overallPct}%` : "—",
			hint: `dari ${formatRupiah(totalTarget)}`,
			icon: Target,
			accent: "info",
		},
	];

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				as="h1"
				eyebrow="Finance"
				title="Dana Cadangan"
				description={`${funds.length} fund · ${activeCount} aktif · auto-deposit dari settlement`}
				actions={
					<Link
						href="/finance/sinking-funds/new"
						className={buttonVariants({ variant: "default", className: "h-9" })}
					>
						<Plus className="size-4" />
						Tambah Dana
					</Link>
				}
			/>

			<StatRow stats={stats} />

			<SinkingFundsExplorer funds={funds} />

			<p className="text-muted-foreground text-xs">
				Saldo dihitung dari{" "}
				<code className="font-mono">sinking_fund_movements</code> (deposit −
				withdrawal). Settlement engine auto-deposit kalau profit &gt; 0.
			</p>
		</Container>
	);
}
