import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

type BankAccountRow = {
	id: string;
	account_name: string;
	bank_name: string;
	account_number: string | null;
	account_holder: string | null;
	coa_code: string;
	is_default_receive: boolean;
	is_active: boolean;
};

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

	return (
		<Container size="xl" className="space-y-6">
			<SectionHeader
				as="h1"
				title="Rekening Bank"
				description={`${accounts.length} akun · default penerima ditandai`}
			/>

			<div className="border-border-default bg-surface-2 overflow-x-auto rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Account Name</TableHead>
							<TableHead>Bank</TableHead>
							<TableHead>Account Number</TableHead>
							<TableHead>Account Holder</TableHead>
							<TableHead>COA</TableHead>
							<TableHead className="text-right">Default</TableHead>
							<TableHead className="text-right">Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{accounts.map((acc) => (
							<TableRow key={acc.id}>
								<TableCell className="font-medium">
									{acc.account_name}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{acc.bank_name}
								</TableCell>
								<TableCell className="tabular text-muted-foreground">
									{acc.account_number ?? "—"}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{acc.account_holder ?? "—"}
								</TableCell>
								<TableCell className="tabular text-muted-foreground text-xs">
									{acc.coa_code}
								</TableCell>
								<TableCell className="text-right">
									{acc.is_default_receive ? (
										<Badge variant="default">Default</Badge>
									) : (
										<span className="text-muted-foreground text-sm">—</span>
									)}
								</TableCell>
								<TableCell className="text-right">
									{acc.is_active ? (
										<Badge variant="default">Active</Badge>
									) : (
										<Badge variant="secondary">Inactive</Badge>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</Container>
	);
}
