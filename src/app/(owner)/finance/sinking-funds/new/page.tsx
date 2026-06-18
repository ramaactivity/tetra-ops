import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { SinkingFundForm } from "@/components/sinking-funds/fund-form";

export default function NewSinkingFundPage() {
	return (
		<Container size="lg" className="space-y-3">
			<SectionHeader
				as="h1"
				title="Dana Baru"
				description="Bikin sinking fund baru untuk alokasi otomatis dari settlement."
			/>
			<div className="border-border-default bg-card max-w-2xl rounded-xl border p-5">
				<SinkingFundForm mode="create" />
			</div>
		</Container>
	);
}
