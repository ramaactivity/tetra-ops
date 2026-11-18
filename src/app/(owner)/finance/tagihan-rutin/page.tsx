import { Repeat } from "lucide-react";
import { TagihanRutinView } from "@/components/finance/tagihan-rutin-view";
import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/get-user";
import { resolveBillNotifications } from "@/lib/finance/bill-reminders";
import { loadCatatData } from "@/lib/finance/quick-record-data";
import { loadBillStatuses } from "@/lib/finance/recurring-bills";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TagihanRutinPage() {
	const me = await getCurrentUser();
	if (me?.profile.role !== "owner" && me?.profile.role !== "super_admin")
		return (
			<Container size="lg">
				<EmptyState
					icon={Repeat}
					title="Khusus owner"
					description="Tagihan rutin hanya bisa diakses owner."
				/>
			</Container>
		);

	const supabase = await createClient();
	const [{ active, inactive }, catatData] = await Promise.all([
		loadBillStatuses(supabase),
		loadCatatData(),
	]);
	// Baru saja dibayar lewat Catat → lonceng & badge menu ikut beres sekarang,
	// tidak menunggu cron besok pagi.
	await resolveBillNotifications(active);

	return (
		<Container size="xl" className="space-y-3 pb-6">
			<SectionHeader title="Tagihan rutin" />
			<TagihanRutinView
				active={active}
				inactive={inactive}
				catatData={catatData}
			/>
		</Container>
	);
}
