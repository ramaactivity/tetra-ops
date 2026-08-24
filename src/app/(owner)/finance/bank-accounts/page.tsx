import { CheckCircle2, CreditCard, Landmark, Wallet } from "lucide-react";
import { AddBankAccountModal } from "@/components/bank-accounts/add-bank-account-modal";
import {
	type BankAccountRow,
	BankAccountsExplorer,
} from "@/components/bank-accounts/bank-accounts-explorer";
import { EmoneyCardsPanel } from "@/components/bank-accounts/emoney-cards-panel";
import { type StatItem, StatRow } from "@/components/catalog/stat-tile";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { loadCashAccounts } from "@/lib/finance/cash-accounts";
import { loadEmoneyCards } from "@/lib/finance/emoney-data";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function BankAccountsListPage() {
	const supabase = await createClient();
	const [{ data, error }, cards, cashAccounts] = await Promise.all([
		supabase
			.from("bank_accounts")
			.select(
				"id, account_name, bank_name, account_number, account_holder, coa_code, is_default_receive, is_active",
			)
			// Kartu punya panelnya sendiri di bawah — tabel ini khusus kas & bank.
			.neq("account_kind", "emoney")
			.order("coa_code", { ascending: true }),
		loadEmoneyCards(supabase, { includeInactive: true }),
		loadCashAccounts(supabase),
	]);

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
	// Sumber topup: semua kas/bank KECUALI kartu — memindah saldo antar kartu
	// tidak bisa dilakukan di dunia nyata.
	const cardCodes = new Set(cards.map((c) => c.coaCode));
	const sources = cashAccounts
		.filter((a) => !cardCodes.has(a.code))
		.map((a) => ({ code: a.code, name: a.name, balance: a.balance }));
	const activeCards = cards.filter((c) => c.isActive);
	const cardTotal = activeCards.reduce((s, c) => s + c.balance, 0);

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
			label: "Saldo di Kartu",
			value: formatRupiah(cardTotal),
			hint: `${activeCards.length} kartu e-toll aktif`,
			icon: CreditCard,
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

			<EmoneyCardsPanel cards={cards} sources={sources} />
		</Container>
	);
}
