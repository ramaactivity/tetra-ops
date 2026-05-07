import { ComingSoonCard } from "@/components/coming-soon-card";

export default function ReportsPage() {
	return (
		<div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 md:px-8">
			<div className="space-y-1">
				<h1 className="text-3xl font-semibold tracking-tight">Reports</h1>
				<p className="text-muted-foreground text-sm">
					Owner earnings, monthly P&L, crew performance.
				</p>
			</div>
			<ComingSoonCard
				title="Reports & Analytics"
				when="Phase 3 Week 13 (PDF Generation)"
			/>
		</div>
	);
}
