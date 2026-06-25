"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

const TABS = [
	{ href: "/settings", label: "Sistem", exact: true },
	{ href: "/settings/crew", label: "Tim" },
	{ href: "/settings/whatsapp-templates", label: "Template WA" },
	{ href: "/settings/notification-rules", label: "Notifikasi" },
	{ href: "/settings/audit-log", label: "Log Audit" },
	{ href: "/settings/assembly", label: "Resep Bahan" },
	{ href: "/settings/cutoff", label: "Cutoff" },
];

export function SettingsTabs() {
	const pathname = usePathname();

	return (
		<TabNav
			aria-label="Settings"
			items={TABS.map((tab) => ({
				label: tab.label,
				href: tab.href,
				active: tab.exact
					? pathname === tab.href
					: pathname.startsWith(tab.href),
			}))}
		/>
	);
}
