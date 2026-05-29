import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/section-header";
import { SinkingFundForm } from "@/components/sinking-funds/fund-form";

export default function NewSinkingFundPage() {
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
				title="New Fund"
				description="Bikin sinking fund baru untuk alokasi otomatis dari settlement."
			/>
			<div className="border-border-default bg-surface-2 max-w-2xl rounded-xl border p-5">
				<SinkingFundForm mode="create" />
			</div>
		</div>
	);
}
