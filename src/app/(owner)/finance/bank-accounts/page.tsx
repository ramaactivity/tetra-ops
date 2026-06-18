import { CheckCircle2, Landmark, Star, Wallet } from "lucide-react";
import { AddBankAccountModal } from "@/components/bank-accounts/add-bank-account-modal";
import {
	type BankAccountRow,
	BankAccountsExplorer,
} from "@/components/bank-accounts/bank-accounts-explorer";
import { type StatItem, StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { createClient } from "@/lib/supabase/server";

export default async function BankAccountsListPage() {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("bank_accounts")
		.select(
			"id, account_name, bank_name, account_number, account_holder, coa_code, is_default_receive, is_active",
		)
		.order("coa_code", { ascending: true });

	if (error) {
		return (
			<div className="border-destructive bg-destructive/10 rounded-md border p-4">
				<p className="text-destructive text-sm font-medium">
					Gagal memuat bank accounts: {error.message}
				</p>
			</div>
		);
	}

	const accounts = (data ?? []) as BankAccountRow[];

	const activeCount = accounts.filter((a) => a.is_active).length;
	const bankCount = new Set(accounts.map((a) => a.bank_name)).size;
	const defaultAcc = accounts.find((a) => a.is_default_receive);

	const stats: StatItem[] = [
		{
			label: "Total Akun",
			value: String(accounts.length),
			hint: "rekening & kas",
			icon: Wallet,
		},
		{
			label: "Aktif",
			value: String(activeCount),
			hint: `${accounts.length - activeCount} nonaktif`,
			icon: CheckCircle2,
			accent: "emerald",
		},
		{
			label: "Bank",
			value: String(bankCount),
			hint: "lembaga berbeda",
			icon: Landmark,
		},
		{
			label: "Default Penerima",
			value: defaultAcc ? defaultAcc.bank_name : "—",
			hint: defaultAcc ? defaultAcc.account_name : "belum diset",
			icon: Star,
			accent: "info",
		},
	];

	return (
		<Container size="xl" className="space-y-3">
			<SectionHeader
				as="h1"
				eyebrow="Finance"
				title="Rekening Bank"
				description={`${accounts.length} akun · default penerima ditandai`}
				actions={<AddBankAccountModal />}
			/>

			<StatRow stats={stats} />

			<BankAccountsExplorer accounts={accounts} />
		</Container>
	);
}
