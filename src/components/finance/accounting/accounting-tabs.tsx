"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

const TABS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: "accounts", label: "Bagan Akun" },
	{ value: "journal", label: "Jurnal" },
];

export function AccountingTabs({ current }: { current: string }) {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	function buildHref(tab: string) {
		const params = new URLSearchParams(searchParams.toString());
		if (tab === "accounts") params.delete("tab");
		else params.set("tab", tab);
		const qs = params.toString();
		return qs ? `${pathname}?${qs}` : pathname;
	}

	return (
		<TabNav
			aria-label="Akuntansi views"
			items={TABS.map((tab) => ({
				label: tab.label,
				href: buildHref(tab.value),
				active: current === tab.value,
			}))}
		/>
	);
}
