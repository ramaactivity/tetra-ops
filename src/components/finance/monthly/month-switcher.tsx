"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

/**
 * Pemilih bulan untuk Buku Bulanan — panah mundur/maju + dropdown daftar bulan.
 * Bulan disimpan di query `?bulan=YYYY-MM` supaya bisa di-share & di-bookmark.
 */
export function MonthSwitcher({
	months,
	current,
	prevYm,
	nextYm,
	labelOf,
}: {
	/** Bulan tersedia, ASC. */
	months: string[];
	current: string;
	prevYm: string | null;
	nextYm: string | null;
	/** ym → label siap tampil (dihitung di server biar konsisten). */
	labelOf: Record<string, string>;
}) {
	const router = useRouter();
	const pathname = usePathname();

	function go(ym: string | null) {
		if (!ym) return;
		router.push(`${pathname}?bulan=${ym}`);
	}

	const arrowCls =
		"press tap inline-flex size-9 items-center justify-center rounded-full border border-border-default text-muted-foreground transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40";

	return (
		<div className="flex items-center gap-1.5">
			<button
				type="button"
				onClick={() => go(prevYm)}
				disabled={!prevYm}
				aria-label="Bulan sebelumnya"
				className={arrowCls}
			>
				<ChevronLeft className="size-4" aria-hidden />
			</button>
			<NativeSelect
				value={current}
				onValueChange={(v) => go(v)}
				options={[...months]
					.reverse()
					.map((m) => ({ value: m, label: labelOf[m] ?? m }))}
				triggerClassName={cn(
					"h-9! min-w-[9.5rem] rounded-full px-3.5 text-[13px] font-medium",
				)}
			/>
			<button
				type="button"
				onClick={() => go(nextYm)}
				disabled={!nextYm}
				aria-label="Bulan berikutnya"
				className={arrowCls}
			>
				<ChevronRight className="size-4" aria-hidden />
			</button>
		</div>
	);
}
