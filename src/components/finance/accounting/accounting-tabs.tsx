"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

// Jurnal duluan — ia tab default (lihat page.tsx), dan tab default yang
// tampil di urutan kedua membingungkan.
const TABS: ReadonlyArray<{ value: string; label: string }> = [
	{ value: "journal", label: "Jurnal" },
	{ value: "accounts", label: "Bagan Akun" },
];

export function AccountingTabs({ current }: { current: string }) {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	function buildHref(tab: string) {
		const params = new URLSearchParams(searchParams.toString());
		// URL bersih (tanpa ?tab) = Jurnal, mengikuti default halaman.
		if (tab === "journal") params.delete("tab");
		else params.set("tab", tab);
		// `entry` memaksa tab Jurnal, jadi harus dilepas saat pindah ke Bagan
		// Akun — kalau tidak, kliknya tidak melakukan apa-apa.
		if (tab === "accounts") params.delete("entry");
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
