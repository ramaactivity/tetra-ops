import { ComingSoonCard } from "@/components/coming-soon-card";

export default function FinancePage() {
	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-1">
				<h1 className="text-3xl font-semibold tracking-tight">Finance</h1>
				<p className="text-muted-foreground text-sm">
					Kas, ledger, dan sinking funds.
				</p>
			</div>
			<ComingSoonCard
				title="Omni Finance"
				when="Phase 2 Week 7-10 (Settlement Engine)"
			/>
		</div>
	);
}
