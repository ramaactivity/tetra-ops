"use client";

import { Landmark } from "lucide-react";
import {
	type CatalogColumn,
	CatalogExplorer,
} from "@/components/catalog/catalog-explorer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type BankAccountRow = {
	id: string;
	account_name: string;
	bank_name: string;
	account_number: string | null;
	account_holder: string | null;
	coa_code: string;
	is_default_receive: boolean;
	is_active: boolean;
};

function Dash() {
	return <span className="text-muted-foreground">—</span>;
}

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

const columns: CatalogColumn<BankAccountRow>[] = [
	{
		key: "account_name",
		header: "Nama Akun",
		cell: (a) => (
			<span className="text-foreground font-medium">{a.account_name}</span>
		),
	},
	{
		key: "bank_name",
		header: "Bank",
		cell: (a) => (
			<span className="border-border-default text-foreground inline-flex h-[22px] items-center rounded-md border px-2 text-[11px] font-medium">
				{a.bank_name}
			</span>
		),
	},
	{
		key: "account_number",
		header: "No. Rekening",
		cell: (a) =>
			a.account_number ? (
				<span className="tabular text-muted-foreground">
					{a.account_number}
				</span>
			) : (
				<Dash />
			),
	},
	{
		key: "account_holder",
		header: "Atas Nama",
		cell: (a) =>
			a.account_holder ? (
				<span className="text-muted-foreground">{a.account_holder}</span>
			) : (
				<Dash />
			),
	},
	{
		key: "coa_code",
		header: "COA",
		cardLabel: "COA",
		cell: (a) => (
			<span className="tabular text-muted-foreground text-xs">
				{a.coa_code}
			</span>
		),
	},
	{
		key: "default",
		header: "Default",
		cell: (a) =>
			a.is_default_receive ? <Badge variant="info">Default</Badge> : <Dash />,
	},
	{
		key: "status",
		header: "Status",
		cell: (a) => <StatusDot active={a.is_active} />,
	},
];

export function BankAccountsExplorer({
	accounts,
}: {
	accounts: BankAccountRow[];
}) {
	return (
		<CatalogExplorer
			rows={accounts}
			columns={columns}
			getId={(a) => a.id}
			searchText={(a) =>
				`${a.account_name} ${a.bank_name} ${a.account_number ?? ""} ${a.account_holder ?? ""} ${a.coa_code}`
			}
			searchPlaceholder="Cari rekening, bank…"
			cardSubtitle={(a) => a.bank_name}
			emptyIcon={Landmark}
			emptyTitle="Belum ada rekening"
			emptyDescription="Tambah rekening bank atau kas untuk mulai mencatat penerimaan."
		/>
	);
}
