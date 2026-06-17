"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
	{ href: "/settings", label: "Sistem", exact: true },
	{ href: "/settings/crew", label: "Tim" },
	{ href: "/settings/whatsapp-templates", label: "Template WA" },
	{ href: "/settings/notification-rules", label: "Notifikasi" },
	{ href: "/settings/audit-log", label: "Log Audit" },
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
							<span className="bg-[#059669] absolute inset-x-0 bottom-0 h-0.5" />
						)}
					</Link>
				);
			})}
		</nav>
	);
}
