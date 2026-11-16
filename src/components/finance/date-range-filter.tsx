"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DatePicker } from "@/components/ui/date-picker";
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

	// Pemilih tanggal app (bukan <input type="date"> bawaan browser).
	const pickerCls =
		"tabular h-7 w-auto rounded-full border-0 bg-transparent px-2 text-[13px] shadow-none hover:bg-secondary";

	return (
		<div
			className={cn(
				"inline-flex h-8 items-center gap-0.5 rounded-full border bg-card px-0.5",
				active ? "border-foreground/40" : "border-border-default",
			)}
		>
			<DatePicker
				aria-label="Dari tanggal"
				value={from}
				onValueChange={(v) => set("dari", v)}
				className={pickerCls}
			/>
			<span className="text-muted-foreground">–</span>
			<DatePicker
				aria-label="Sampai tanggal"
				value={to}
				onValueChange={(v) => set("sampai", v)}
				className={pickerCls}
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
