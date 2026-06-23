"use client";

import { useSearchParams } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

/**
 * Warehouse navigation TABS = VIEWS (filtering data master).
 * Beda dari TOMBOL ATAS yg untuk ACTIONS/WORKFLOWS (Stock Opname, Pembelian, dll).
 *
 * Sub-nav utama section ini → underline tabs (lihat <TabNav>). Diletakkan
 * langsung di bawah judul, di ATAS KPI cards, karena tab mengganti SELURUH
 * isi section (cards + tabel) — jadi tab harus jadi anchor paling atas.
 */
// Top-level tabs are kept deliberately few for non-technical owners. The
// technical/financial views (fixed_asset, market, movements) + the sub-route
// pages live under "Lanjutan" (advanced) instead of cluttering the main nav.
const TABS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: "forecast", label: "Kebutuhan Event" },
	{ value: "consumables", label: "Persediaan" },
	{ value: "bundles", label: "Set" },
	{ value: "advanced", label: "Lanjutan" },
];

// Views that render inline but are reached via the "Lanjutan" landing — the
// Lanjutan tab stays highlighted while viewing them.
const ADVANCED_VIEWS = new Set([
	"advanced",
	"fixed_asset",
	"market",
	"movements",
]);

export function WarehouseTabs({ current }: { current: string }) {
	const searchParams = useSearchParams();

	function buildHref(tab: string): string {
		const params = new URLSearchParams(searchParams.toString());
		// "forecast" is the default surface (bare /warehouse). Drop the param for
		// it so the URL stays clean; keep explicit params for every other tab.
		if (tab === "forecast") params.delete("tab");
		else params.set("tab", tab);
		// Date filters only apply to the movements log — strip them when leaving.
		if (tab !== "movements") {
			params.delete("from");
			params.delete("to");
		}
		const qs = params.toString();
		return qs ? `/warehouse?${qs}` : "/warehouse";
	}

	return (
		<TabNav
			aria-label="Warehouse views"
			items={TABS.map((tab) => ({
				label: tab.label,
				href: buildHref(tab.value),
				active:
					tab.value === "advanced"
						? ADVANCED_VIEWS.has(current)
						: current === tab.value,
			}))}
		/>
	);
}
