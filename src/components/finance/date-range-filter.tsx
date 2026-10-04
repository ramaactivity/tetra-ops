"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Rentang tanggal bebas di query `?dari=&sampai=` (menggantikan `?bulan`).
 * Kosongkan → kembali ke mode per bulan.
 */
export function DateRangeFilter({
	from,
	to,
	active,
}: {
	from: string;
	to: string;
	/** true kalau rentang bebas sedang dipakai (bukan bulan penuh). */
	active: boolean;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	function push(next: URLSearchParams) {
		router.push(`${pathname}?${next}`);
	}

	function set(field: "dari" | "sampai", value: string) {
		if (!value) return;
		let a = field === "dari" ? value : from;
		let b = field === "sampai" ? value : to;
		// Tanggal terbalik → tukar, biar tidak pernah kosong tanpa alasan.
		if (a > b) [a, b] = [b, a];
		const next = new URLSearchParams(params.toString());
		next.delete("bulan");
		next.set("dari", a);
		next.set("sampai", b);
		push(next);
	}

	function clear() {
		const next = new URLSearchParams(params.toString());
		next.delete("dari");
		next.delete("sampai");
		next.set("bulan", from.slice(0, 7));
		push(next);
	}

	const inputCls =
		"tabular h-7 rounded-full bg-transparent px-1.5 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

	return (
		<div
			className={cn(
				"inline-flex h-8 items-center gap-1 rounded-full border bg-card pl-2 pr-1",
				active ? "border-foreground/40" : "border-border-default",
			)}
		>
			<input
				type="date"
				aria-label="Dari tanggal"
				value={from}
				onChange={(e) => set("dari", e.target.value)}
				className={inputCls}
			/>
			<span className="text-muted-foreground">–</span>
			<input
				type="date"
				aria-label="Sampai tanggal"
				value={to}
				onChange={(e) => set("sampai", e.target.value)}
				className={inputCls}
			/>
			{active && (
				<button
					type="button"
					onClick={clear}
					aria-label="Hapus rentang, kembali per bulan"
					className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
				>
					<X className="size-3.5" aria-hidden />
				</button>
			)}
		</div>
	);
}
