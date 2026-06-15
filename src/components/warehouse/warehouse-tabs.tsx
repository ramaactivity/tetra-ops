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
const TABS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: "consumables", label: "Persediaan" },
	{ value: "fixed_asset", label: "Aset Tetap" },
	{ value: "market", label: "Market List" },
	{ value: "movements", label: "Log Mutasi" },
	{ value: "bundles", label: "Bundle / Set" },
];

export function WarehouseTabs({ current }: { current: string }) {
	const searchParams = useSearchParams();

	function buildHref(tab: string): string {
		const params = new URLSearchParams(searchParams.toString());
		if (tab === "consumables") params.delete("tab");
		else params.set("tab", tab);
		const qs = params.toString();
		return qs ? `/warehouse?${qs}` : "/warehouse";
	}

	return (
		<TabNav
			aria-label="Warehouse views"
			items={TABS.map((tab) => ({
				label: tab.label,
				href: buildHref(tab.value),
				active: current === tab.value,
			}))}
		/>
	);
}
