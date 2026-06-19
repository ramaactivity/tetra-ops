import { Building2, MessageCircle } from "lucide-react";
import { TabNav } from "@/components/ui/tab-nav";

/**
 * <LeadsTabs /> — sub-navigation between the raw lead log (Leads) and the B2B
 * account view (Rekanan). Same segmented-pill rail used across the app.
 */
export function LeadsTabs({
	active,
	rekananCount,
}: {
	active: "leads" | "rekanan";
	rekananCount?: number;
}) {
	return (
		<TabNav
			aria-label="Tampilan leads"
			items={[
				{
					label: "Leads",
					href: "/leads",
					active: active === "leads",
					icon: <MessageCircle className="size-3.5" aria-hidden />,
				},
				{
					label: "Rekanan",
					href: "/leads/rekanan",
					active: active === "rekanan",
					icon: <Building2 className="size-3.5" aria-hidden />,
					count: rekananCount,
				},
			]}
		/>
	);
}
