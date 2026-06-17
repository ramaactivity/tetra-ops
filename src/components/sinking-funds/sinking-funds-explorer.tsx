"use client";

import { PiggyBank, ScrollText } from "lucide-react";
import Link from "next/link";
import {
	type CatalogColumn,
	CatalogExplorer,
} from "@/components/catalog/catalog-explorer";
import { EditLink, iconActionClass } from "@/components/catalog/form-kit";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ToggleActiveButton } from "./toggle-active-button";

export type FundRow = {
	id: string;
	code: string;
	name: string;
	description: string | null;
	allocation_type: "percentage" | "flat";
	allocation_value: number;
	target_balance: number | null;
	balance: number;
	is_active: boolean;
};

function StatusDot({ active }: { active: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 text-[12px] font-medium",
				active
					? "text-emerald-600 dark:text-emerald-400"
					: "text-muted-foreground",
			)}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					active ? "bg-emerald-500" : "bg-muted-foreground/50",
				)}
			/>
			{active ? "Aktif" : "Nonaktif"}
		</span>
	);
}

function AllocationRule({ fund }: { fund: FundRow }) {
	const isPct = fund.allocation_type === "percentage";
	return (
		<span className="inline-flex items-baseline gap-1">
			<span className="tabular text-foreground text-sm font-medium">
				{isPct
					? `${Number(fund.allocation_value)}%`
					: formatRupiah(Number(fund.allocation_value))}
			</span>
			<span className="text-muted-foreground text-xs">
				/ {isPct ? "profit" : "event"}
			</span>
		</span>
	);
}

function SaldoCell({ fund }: { fund: FundRow }) {
	const pct =
		fund.target_balance && fund.target_balance > 0
			? Math.min(100, Math.round((fund.balance / fund.target_balance) * 100))
			: null;
	return (
		<div className="flex flex-col items-end gap-1">
			<span className="tabular text-foreground font-semibold">
				{formatRupiah(fund.balance)}
			</span>
			{pct !== null && (
				<div className="flex w-full max-w-[150px] items-center gap-2">
					<div className="bg-secondary relative h-1.5 flex-1 overflow-hidden rounded-full">
						<span
							aria-hidden
							className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
							style={{ width: `${pct}%` }}
						/>
					</div>
					<span className="tabular text-muted-foreground w-7 text-right text-[11px]">
						{pct}%
					</span>
				</div>
			)}
		</div>
	);
}

const columns: CatalogColumn<FundRow>[] = [
	{
		key: "name",
		header: "Nama",
		cell: (f) => (
			<div className="min-w-0">
				<div className="text-foreground font-medium">{f.name}</div>
				{f.description && (
					<div className="text-muted-foreground mt-0.5 text-xs">
						{f.description}
					</div>
				)}
			</div>
		),
	},
	{
		key: "code",
		header: "Code",
		cardLabel: "Code",
		cell: (f) => (
			<span className="tabular text-muted-foreground text-xs">{f.code}</span>
		),
	},
	{
		key: "rule",
		header: "Aturan",
		cardLabel: "Aturan alokasi",
		cell: (f) => <AllocationRule fund={f} />,
	},
	{
		key: "balance",
		header: "Saldo",
		align: "right",
		cell: (f) => <SaldoCell fund={f} />,
	},
	{
		key: "target",
		header: "Target",
		align: "right",
		cell: (f) =>
			f.target_balance ? (
				<span className="tabular text-muted-foreground text-sm">
					{formatRupiah(f.target_balance)}
				</span>
			) : (
				<span className="text-muted-foreground">—</span>
			),
	},
	{
		key: "status",
		header: "Status",
		cell: (f) => <StatusDot active={f.is_active} />,
	},
];

export function SinkingFundsExplorer({ funds }: { funds: FundRow[] }) {
	return (
		<CatalogExplorer
			rows={funds}
			columns={columns}
			getId={(f) => f.id}
			titleKey="name"
			cardSubtitle={(f) => f.code}
			searchText={(f) => `${f.name} ${f.code} ${f.description ?? ""}`}
			searchPlaceholder="Cari dana cadangan…"
			renderActions={(f) => (
				<>
					<Link
						href={`/finance/sinking-funds/${f.id}/movements`}
						title="Movements"
						aria-label={`Movements ${f.name}`}
						className={iconActionClass}
					>
						<ScrollText className="size-4" />
					</Link>
					<EditLink
						href={`/finance/sinking-funds/${f.id}/edit`}
						label={f.name}
					/>
					<ToggleActiveButton id={f.id} isActive={f.is_active} name={f.name} />
				</>
			)}
			emptyIcon={PiggyBank}
			emptyTitle="Belum ada dana cadangan"
			emptyDescription="Bikin fund pertama agar settlement bisa alokasi otomatis."
		/>
	);
}
