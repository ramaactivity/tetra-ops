import {
	BarChart3,
	Building2,
	HeartHandshake,
	MessageCircle,
} from "lucide-react";
import { TabNav } from "@/components/ui/tab-nav";

/**
 * <LeadsTabs /> — sub-navigation across the lead log (Leads), the B2B account
 * view (Rekanan), the analytics dashboard (Analitik) and B2B client retention (Retensi). Same segmented-pill
 * rail used across the app.
 */
export function LeadsTabs({
	active,
	rekananCount,
}: {
	active: "leads" | "rekanan" | "analitik" | "retensi";
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
				{
					label: "Analitik",
					href: "/leads/analitik",
					active: active === "analitik",
					icon: <BarChart3 className="size-3.5" aria-hidden />,
				},
				{
					label: "Retensi",
					href: "/leads/retensi",
					active: active === "retensi",
					icon: <HeartHandshake className="size-3.5" aria-hidden />,
				},
			]}
		/>
	);
}
