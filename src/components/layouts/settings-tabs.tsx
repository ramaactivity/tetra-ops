"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
	{ href: "/settings", label: "System", exact: true },
	{ href: "/settings/packages", label: "Packages" },
	{ href: "/settings/addons", label: "Add-ons" },
	{ href: "/settings/backdrops", label: "Backdrops" },
	{ href: "/settings/items", label: "Items" },
	{ href: "/settings/bank-accounts", label: "Banks" },
	{ href: "/settings/crew", label: "Crew" },
	{ href: "/settings/contacts", label: "Contacts" },
	{ href: "/settings/sinking-funds", label: "Sinking Funds" },
	{ href: "/settings/whatsapp-templates", label: "WA Templates" },
	{ href: "/settings/notification-rules", label: "Notif Rules" },
	{ href: "/settings/audit-log", label: "Audit Log" },
];

export function SettingsTabs() {
	const pathname = usePathname();

	return (
		<nav className="border-border-default flex gap-1 overflow-x-auto border-b">
			{TABS.map((tab) => {
				const isActive = tab.exact
					? pathname === tab.href
					: pathname.startsWith(tab.href);
				return (
					<Link
						key={tab.href}
						href={tab.href}
						className={cn(
							"relative shrink-0 px-4 py-3 text-sm font-medium transition-colors",
							isActive
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{tab.label}
						{isActive && (
							<span className="bg-primary absolute inset-x-0 bottom-0 h-0.5" />
						)}
					</Link>
				);
			})}
		</nav>
	);
}
