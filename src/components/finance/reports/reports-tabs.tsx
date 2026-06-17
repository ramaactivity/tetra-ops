"use client";

import { useSearchParams } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

const TABS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: "trial", label: "Neraca Saldo" },
	{ value: "pnl", label: "Laba / Rugi" },
	{ value: "neraca", label: "Neraca" },
];

export function ReportsTabs({ current }: { current: string }) {
	const params = useSearchParams();

	function buildHref(value: string) {
		const next = new URLSearchParams(params.toString());
		if (value === "trial") next.delete("report");
		else next.set("report", value);
		const qs = next.toString();
		return `/finance/reports${qs ? `?${qs}` : ""}`;
	}

	return (
		<TabNav
			aria-label="Laporan keuangan"
			items={TABS.map((tab) => ({
				label: tab.label,
				href: buildHref(tab.value),
				active: current === tab.value,
			}))}
		/>
	);
}
