import { Pencil, Plus, ScrollText } from "lucide-react";
import Link from "next/link";
import { ToggleActiveButton } from "@/components/sinking-funds/toggle-active-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type FundRow = {
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

	const funds = (fundsData ?? []) as FundRow[];
	const movements = (movementsData ?? []) as MovementAgg[];

	const balanceById = new Map<string, number>();
	for (const m of movements) {
		const prev = balanceById.get(m.fund_id) ?? 0;
		const delta = m.movement_type === "deposit" ? m.amount : -m.amount;
		balanceById.set(m.fund_id, prev + delta);
	}

	const activeCount = funds.filter((f) => f.is_active).length;
	const totalBalance = funds.reduce(
		(s, f) => s + (balanceById.get(f.id) ?? 0),
		0,
	);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">
						Sinking Funds
					</h2>
					<p className="text-muted-foreground text-sm">
						{funds.length} fund · {activeCount} aktif · total saldo{" "}
						<span className="tabular text-foreground font-medium">
							{formatRupiah(totalBalance)}
						</span>
					</p>
				</div>
				<Link
					href="/settings/sinking-funds/new"
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium"
				>
					<Plus className="h-4 w-4" />
					New fund
				</Link>
			</div>

			{funds.length === 0 ? (
				<EmptyState
					icon={ScrollText}
					title="Belum ada sinking fund"
					description="Bikin fund pertama agar settlement bisa alokasi otomatis."
				/>
			) : (
				<div className="border-border-default bg-surface-2 overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Code</TableHead>
								<TableHead>Nama</TableHead>
								<TableHead>Aturan</TableHead>
								<TableHead className="text-right">Saldo</TableHead>
								<TableHead className="text-right">Target</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-[140px] text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{funds.map((f) => {
								const balance = balanceById.get(f.id) ?? 0;
								const targetPct =
									f.target_balance && f.target_balance > 0
										? Math.min(
												100,
												Math.round((balance / f.target_balance) * 100),
											)
										: null;
								return (
									<TableRow key={f.id}>
										<TableCell className="text-muted-foreground tabular text-xs">
											{f.code}
										</TableCell>
										<TableCell>
											<div className="space-y-0.5">
												<div className="font-medium">{f.name}</div>
												{f.description && (
													<div className="text-muted-foreground text-xs">
														{f.description}
													</div>
												)}
											</div>
										</TableCell>
										<TableCell>
											{f.allocation_type === "percentage" ? (
												<span className="tabular text-sm">
													{Number(f.allocation_value)}%{" "}
													<span className="text-muted-foreground text-xs">
														/ profit
													</span>
												</span>
											) : (
												<span className="tabular text-sm">
													{formatRupiah(Number(f.allocation_value))}{" "}
													<span className="text-muted-foreground text-xs">
														/ event
													</span>
												</span>
											)}
										</TableCell>
										<TableCell className="text-right">
											<div className="tabular text-foreground font-medium">
												{formatRupiah(balance)}
											</div>
											{targetPct !== null && (
												<>
													<div className="bg-muted relative ml-auto mt-1 h-1.5 w-full max-w-[140px] overflow-hidden rounded-full">
														<span
															aria-hidden="true"
															className="bg-primary absolute inset-y-0 left-0 rounded-full"
															style={{ width: `${targetPct}%` }}
														/>
													</div>
													<div className="text-muted-foreground mt-1 text-xs">
														{targetPct}%
													</div>
												</>
											)}
										</TableCell>
										<TableCell className="tabular text-muted-foreground text-right text-sm">
											{f.target_balance ? formatRupiah(f.target_balance) : "—"}
										</TableCell>
										<TableCell>
											{f.is_active ? (
												<Badge variant="default">Aktif</Badge>
											) : (
												<Badge variant="secondary">Nonaktif</Badge>
											)}
										</TableCell>
										<TableCell>
											<div className="flex items-center justify-end gap-1">
												<Link
													href={`/settings/sinking-funds/${f.id}/movements`}
													title="Movements"
													className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
												>
													<ScrollText className="h-4 w-4" />
												</Link>
												<Link
													href={`/settings/sinking-funds/${f.id}/edit`}
													title="Edit"
													className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
												>
													<Pencil className="h-4 w-4" />
												</Link>
												<ToggleActiveButton
													id={f.id}
													isActive={f.is_active}
													name={f.name}
												/>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			<p className="text-muted-foreground text-xs">
				Saldo dihitung dari{" "}
				<code className="font-mono">sinking_fund_movements</code> (deposit −
				withdrawal). Settlement engine auto-deposit kalau profit &gt; 0.
			</p>
		</div>
	);
}
