import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeader } from "@/components/layout/section-header";
import { SinkingFundForm } from "@/components/sinking-funds/fund-form";
import { createClient } from "@/lib/supabase/server";

export default async function EditSinkingFundPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();

	const { data: fund } = await supabase
		.from("sinking_funds")
		.select(
			"id, code, name, description, allocation_type, allocation_value, target_balance, coa_account, display_order, is_active",
		)
		.eq("id", id)
		.maybeSingle();

	if (!fund) notFound();

	const defaults = {
		code: fund.code,
		name: fund.name,
		description: fund.description ?? "",
		allocation_type: fund.allocation_type as "percentage" | "flat",
		allocation_value: String(fund.allocation_value ?? ""),
		target_balance: fund.target_balance ? String(fund.target_balance) : "",
		coa_account: fund.coa_account ?? "",
		display_order: String(fund.display_order ?? 0),
		is_active: !!fund.is_active,
	};

	return (
		<div className="space-y-4">
			<Link
				href="/finance/sinking-funds"
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
			>
				<ChevronLeft className="h-4 w-4" />
				Sinking Funds
			</Link>
			<SectionHeader
				as="h2"
				title={`Edit: ${fund.name}`}
				description={<span className="tabular">{fund.code}</span>}
			/>
			<div className="border-border-default bg-surface-2 max-w-2xl rounded-xl border p-5">
				<SinkingFundForm mode="edit" id={fund.id} defaults={defaults} />
			</div>
		</div>
	);
}
